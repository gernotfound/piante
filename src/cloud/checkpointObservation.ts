import { z } from 'zod';
import { uidSchema } from './protocol';
import { inspectCheckpointCandidate } from './checkpointCandidate';
import { ReconciliationBlocked, type CloudJournalReader } from './reconciliationPreview';
import { type LocalGardenRepository } from '../storage/localRepository';

/** Advisory observations are not causal checkpoints or journal GC authority. */
export const checkpointObservationSchema=z.strictObject({
  protocol:z.literal(1),
  status:z.literal('observation-only'),
  compactionAuthorized:z.literal(false),
  ownerUid:uidSchema,
  replicaId:z.uuid(),
  receiptCount:z.number().int().min(0).max(200),
  observedPrefixes:z.record(z.uuid(),z.number().int().positive().max(200)),
  sha256:z.string().regex(/^[0-9a-f]{64}$/)
}).superRefine((row,ctx)=>{
  const counts=Object.values(row.observedPrefixes);
  if(counts.length>200||counts.reduce((sum,n)=>sum+n,0)!==row.receiptCount){
    ctx.addIssue({code:'custom',message:'Prefissi non coerenti con ricevute'});
  }
});
export type CheckpointObservation=z.infer<typeof checkpointObservationSchema>;

export class CheckpointObservationConflict extends Error{
  constructor(){
    super('Osservazione cloud divergente o regressiva');
    this.name='CheckpointObservationConflict';
  }
}
export function prefixesCover(
  cover:Readonly<Record<string,number>>,covered:Readonly<Record<string,number>>
):boolean{
  return Object.entries(covered).every(([replica,seq])=>(cover[replica]??0)>=seq);
}
export interface CheckpointObservationPort{
  /** Transactional CAS and authenticated server readback; throws on ambiguity. */
  saveAndVerify(record:CheckpointObservation):Promise<'created'|'advanced'|'duplicate'>;
}
export type CheckpointObservationResult={
  readonly status:'server-observation-only';
  readonly outcome:'created'|'advanced'|'duplicate';
  readonly observation:CheckpointObservation;
  readonly compactionAuthorized:false;
};
function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value===null||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([key,item])=>[key,stable(item)]));
}
export function sameObservation(a:unknown,b:unknown):boolean{
  return JSON.stringify(stable(a))===JSON.stringify(stable(b));
}

/** Publish only after a fully validated candidate; never change the journal. */
export async function publishCheckpointObservation(
  repository:LocalGardenRepository,reader:CloudJournalReader,
  port:CheckpointObservationPort,ownerUid:string,isStillAuthorized:()=>boolean
):Promise<CheckpointObservationResult>{
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const before=await repository.read();
  if(!isStillAuthorized()||before.ownerScope!=='user:'+ownerUid){
    throw new ReconciliationBlocked('identity-changed');
  }
  const candidate=await inspectCheckpointCandidate(repository,reader,ownerUid,isStillAuthorized);
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const confirmed=await repository.read();
  if(!sameObservation(before,confirmed))throw new ReconciliationBlocked('concurrent-local-change');
  const row=checkpointObservationSchema.parse({
    protocol:1,status:'observation-only',compactionAuthorized:false,
    ownerUid,replicaId:confirmed.replicaId,receiptCount:candidate.receiptCount,
    observedPrefixes:candidate.observedPrefixes,sha256:candidate.sha256
  });
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const outcome=await port.saveAndVerify(row);
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const final=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!sameObservation(final,confirmed))throw new ReconciliationBlocked('concurrent-local-change');
  return {status:'server-observation-only',outcome,observation:row,compactionAuthorized:false};
}
