import { z } from 'zod';
import { domainOperationSchema } from '../domain/schema';
import { uidSchema } from './protocol';

/**
 * M5c-1: PROPOSED protocol v2 metadata in a PURE laboratory validator.
 * No v2 Firestore writer, migration, authenticated membership or GC exists.
 * A caller-provided epoch is NOT evidence of a provider-authorized epoch.
 */
export const MAX_CAUSAL_V2_ROWS = 1000;
export const MAX_CAUSAL_V2_REPLICAS = 64;

export const causalReceiptV2Schema = z.strictObject({
  protocol: z.literal(2),
  ownerUid: uidSchema,
  membershipEpoch: z.number().int().positive().safe(),
  replicaId: z.uuid(),
  sequence: z.number().int().positive().safe(),
  operationId: z.string().min(1).max(160),
  appliedAt: z.number().int().nonnegative().safe(),
  // A vector of operations observed BEFORE this event. Counts include 0.
  observedPrefixes: z.record(z.uuid(), z.number().int().nonnegative().safe()),
  operation: domainOperationSchema
}).superRefine((row,ctx)=>{
  if(row.operationId!==row.replicaId+':'+row.sequence){
    ctx.addIssue({code:'custom',message:'Operation ID is not replica:sequence'});
  }
  if(row.observedPrefixes[row.replicaId]!==row.sequence-1){
    ctx.addIssue({code:'custom',message:'Own prefix must equal previous sequence'});
  }
  if(Object.keys(row.observedPrefixes).length>MAX_CAUSAL_V2_REPLICAS){
    ctx.addIssue({code:'custom',message:'Too many causal replicas'});
  }
});
export type CausalReceiptV2=z.infer<typeof causalReceiptV2Schema>;
export type CausalRowV2={readonly id:string;readonly data:unknown};
export type CausalV2Reason=
  |'limit-exceeded'|'invalid-receipt'|'history-gap'
  |'epoch-mismatch'|'missing-dependency'|'causal-regression'|'causal-cycle';
export class CausalV2Blocked extends Error{
  constructor(readonly reason:CausalV2Reason){
    super('Analisi causale v2 bloccata: '+reason);
    this.name='CausalV2Blocked';
  }
}
export type CausalV2Diagnostic={
  readonly status:'diagnostic-only';
  readonly compactionAuthorized:false;
  readonly ownerUid:string;
  readonly membershipEpoch:number;
  readonly receiptCount:number;
  /** Each layer is a set of mutually unordered receipts, NOT a replay order. */
  readonly layers:readonly (readonly string[])[];
  readonly concurrentPairs:number;
  readonly requiresConflictResolution:boolean;
};

/**
 * Validate a COMPLETE, synthetic v2 history using explicit causal vectors.
 * The caller MUST NOT pass a truncated cloud page or treat this as a trusted
 * replica membership snapshot. Even fully ordered history grants NO GC rights.
 */
export function analyzeCausalV2(
  ownerUid:string,rows:readonly CausalRowV2[],max=MAX_CAUSAL_V2_ROWS
):CausalV2Diagnostic{
  if(!Number.isSafeInteger(max)||max<1||max>MAX_CAUSAL_V2_ROWS||rows.length>max){
    throw new CausalV2Blocked('limit-exceeded');
  }
  if(!uidSchema.safeParse(ownerUid).success||rows.length===0){
    throw new CausalV2Blocked('invalid-receipt');
  }
  const byId=new Map<string,CausalReceiptV2>();
  const byReplica=new Map<string,Map<number,CausalReceiptV2>>();
  let epoch:number|undefined;
  for(const raw of rows){
    const parsed=causalReceiptV2Schema.safeParse(raw.data);
    if(!parsed.success||parsed.data.ownerUid!==ownerUid||
       parsed.data.operationId!==raw.id||byId.has(raw.id)){
      throw new CausalV2Blocked('invalid-receipt');
    }
    const row=parsed.data;
    if(epoch!==undefined&&row.membershipEpoch!==epoch){
      // Epoch transitions need provider-authorized fencing and retirement
      // records; they cannot be inferred from arbitrary client receipts.
      throw new CausalV2Blocked('epoch-mismatch');
    }
    epoch=row.membershipEpoch;
    byId.set(raw.id,row);
    const replica=byReplica.get(row.replicaId)??new Map<number,CausalReceiptV2>();
    replica.set(row.sequence,row);
    byReplica.set(row.replicaId,replica);
  }
  if(byReplica.size>MAX_CAUSAL_V2_REPLICAS){
    throw new CausalV2Blocked('limit-exceeded');
  }
  for(const replica of byReplica.values()){
    for(let seq=1;seq<=replica.size;seq++){
      if(!replica.has(seq))throw new CausalV2Blocked('history-gap');
    }
  }
  // Topological edges: every vector entry names a *complete* contiguous
  // prefix. Its last receipt transitively implies all earlier ones.
  const dependencies=new Map<string,Set<string>>();
  for(const row of byId.values()){
    const edges=new Set<string>();
    for(const [replicaId,sequence] of Object.entries(row.observedPrefixes)){
      if(sequence===0)continue;
      const ancestor=byReplica.get(replicaId)?.get(sequence);
      if(!ancestor)throw new CausalV2Blocked('missing-dependency');
      for(const [prevId,prevSeq] of Object.entries(ancestor.observedPrefixes)){
        if((row.observedPrefixes[prevId]??0)<prevSeq){
          throw new CausalV2Blocked('causal-regression');
        }
      }
      edges.add(ancestor.operationId);
    }
    dependencies.set(row.operationId,edges);
  }
  // Compute simultaneous topological layers, without imposing wall-clock or
  // lexical order between independent edits. Never replay these as LWW.
  const remaining=new Set(byId.keys()),completed=new Set<string>();
  const layers:string[][]=[];
  while(remaining.size>0){
    const ready=[...remaining].filter(id=>
      [...(dependencies.get(id)??[])].every(dep=>completed.has(dep))
    ).sort();
    if(!ready.length)throw new CausalV2Blocked('causal-cycle');
    layers.push(ready);
    for(const id of ready){remaining.delete(id);completed.add(id);}
  }
  const values=[...byId.values()];
  let concurrentPairs=0;
  for(let i=0;i<values.length;i++){
    const a=values[i];
    for(let j=i+1;j<values.length;j++){
      const b=values[j];
      if((a.observedPrefixes[b.replicaId]??0)<b.sequence&&
         (b.observedPrefixes[a.replicaId]??0)<a.sequence){
        concurrentPairs++;
      }
    }
  }
  return {
    status:'diagnostic-only',compactionAuthorized:false,
    ownerUid,membershipEpoch:epoch!,
    receiptCount:rows.length,layers,concurrentPairs,
    requiresConflictResolution:concurrentPairs>0
  };
}
