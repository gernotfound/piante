import { checkpointObservationSchema, type CheckpointObservation, prefixesCover } from './checkpointObservation';
import { ReconciliationBlocked } from './reconciliationPreview';
import { uidSchema } from './protocol';

export const MAX_OBSERVATIONS = 200;
export type ObservationRow = { readonly id:string; readonly data:unknown };
export interface ObservationReader {
  /** Complete, server-only read; reject truncation rather than returning a page. */
  readAll(ownerUid:string,max:number):Promise<readonly ObservationRow[]>;
}
export type ObservationAudit = {
  readonly status:'advisory-audit-only';
  readonly compactionAuthorized:false;
  readonly ownerUid:string;
  readonly replicaCount:number;
  readonly observations:readonly CheckpointObservation[];
  /** Same observed prefixes but conflicting content digests are suspicious, never authoritative. */
  readonly discrepancies:readonly {readonly left:string;readonly right:string;readonly reason:'same-prefix-different-digest'}[];
  readonly incomparablePairs:number;
};

function equalPrefixes(a:Readonly<Record<string,number>>,b:Readonly<Record<string,number>>):boolean{
  return prefixesCover(a,b)&&prefixesCover(b,a);
}
function validMax(max:number):void{
  if(!Number.isSafeInteger(max)||max<1||max>MAX_OBSERVATIONS){
    throw new ReconciliationBlocked('limit-exceeded');
  }
}
/** Validates all rows BEFORE comparing them; no inferred global stable frontier. */
export function buildObservationAudit(ownerUid:string,rows:readonly ObservationRow[],max=MAX_OBSERVATIONS):ObservationAudit{
  if(!uidSchema.safeParse(ownerUid).success)throw new ReconciliationBlocked('identity-changed');
  validMax(max);
  if(rows.length>max)throw new ReconciliationBlocked('limit-exceeded');
  const seen=new Set<string>();
  const observations:CheckpointObservation[]=[];
  for(const row of rows){
    const parsed=checkpointObservationSchema.safeParse(row.data);
    if(!parsed.success||parsed.data.ownerUid!==ownerUid||parsed.data.replicaId!==row.id||seen.has(row.id)){
      throw new ReconciliationBlocked('invalid-receipt');
    }
    seen.add(row.id);observations.push(parsed.data);
  }
  observations.sort((a,b)=>a.replicaId<b.replicaId?-1:a.replicaId>b.replicaId?1:0);
  const discrepancies:ObservationAudit['discrepancies'][number][]=[];
  let incomparablePairs=0;
  for(let i=0;i<observations.length;i++)for(let j=i+1;j<observations.length;j++){
    const a=observations[i],b=observations[j];
    if(equalPrefixes(a.observedPrefixes,b.observedPrefixes)){
      if(a.sha256!==b.sha256)discrepancies.push({
        left:a.replicaId,right:b.replicaId,reason:'same-prefix-different-digest'
      });
    }else if(!prefixesCover(a.observedPrefixes,b.observedPrefixes)&&
      !prefixesCover(b.observedPrefixes,a.observedPrefixes)){
      incomparablePairs++;
    }
  }
  return {status:'advisory-audit-only',compactionAuthorized:false,ownerUid,
    replicaCount:observations.length,observations,discrepancies,incomparablePairs};
}
/** Auth-fenced server read. No storage writes or GC capability. */
export async function inspectObservationAudit(
  reader:ObservationReader,ownerUid:string,isStillAuthorized:()=>boolean,max=MAX_OBSERVATIONS
):Promise<ObservationAudit>{
  if(!isStillAuthorized()||!uidSchema.safeParse(ownerUid).success){
    throw new ReconciliationBlocked('identity-changed');
  }
  validMax(max);
  let rows:readonly ObservationRow[];
  try{rows=await reader.readAll(ownerUid,max);}
  catch(e){if(e instanceof ReconciliationBlocked)throw e;
    throw new ReconciliationBlocked('remote-unavailable');}
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const audit=buildObservationAudit(ownerUid,rows,max);
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  return audit;
}
