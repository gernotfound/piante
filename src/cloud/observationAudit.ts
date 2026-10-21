import { checkpointObservationSchema, prefixesCover, sameObservation } from './checkpointObservation';
import { inspectCheckpointCandidate, type CheckpointCandidate } from './checkpointCandidate';
import { ReconciliationBlocked, type CloudJournalReader } from './reconciliationPreview';
import { type LocalGardenRepository } from '../storage/localRepository';

/**
 * Server observations are CLIENT ATTESTATIONS, not a trusted causal frontier.
 * Even a full agreement cannot authorize GC, deletion, or checkpoint recovery.
 */
export type ObservationRow={readonly id:string;readonly data:unknown};
export interface CheckpointObservationReader{
  /** Complete SERVER read, fail on truncation, never use a local Firestore cache. */
  readAll(ownerUid:string,max:number):Promise<readonly ObservationRow[]>;
}
export type ObservationAudit={
  readonly status:'audit-only';
  readonly compactionAuthorized:false;
  readonly ownerUid:string;
  readonly candidateSha256:string;
  readonly candidateReceiptCount:number;
  readonly observationCount:number;
  /** Exact equality to the local candidate is not a globally stable frontier. */
  readonly matchingCurrentCount:number;
  readonly historicalCount:number;
};
export type ObservationAuditReason=
  |'invalid-observation'|'duplicate-observation'|'limit-exceeded'
  |'prefix-not-observed'|'digest-disagreement'|'remote-unavailable';
export class ObservationAuditBlocked extends Error{
  constructor(readonly reason:ObservationAuditReason){
    super('Audit osservazioni bloccato: '+reason);
    this.name='ObservationAuditBlocked';
  }
}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const canonicalPrefixes=(prefixes:Readonly<Record<string,number>>)=>
  JSON.stringify(Object.entries(prefixes).sort(([a],[b])=>compare(a,b)));

/**
 * Compare bounded observations to one verified server-scan candidate. Older
 * prefixes may have DIFFERENT fingerprints; only observations over identical
 * prefixes must share a fingerprint. No cross-device acknowledgement is inferred.
 */
export function buildObservationAudit(
  candidate:CheckpointCandidate,raw:readonly ObservationRow[],
  max=200
):ObservationAudit{
  if(!Number.isSafeInteger(max)||max<1||max>200||raw.length>max){
    throw new ObservationAuditBlocked('limit-exceeded');
  }
  if(candidate.status!=='candidate-only'||candidate.compactionAuthorized!==false){
    throw new ObservationAuditBlocked('invalid-observation');
  }
  const byReplica=new Set<string>();
  const byPrefix=new Map<string,string>();
  let matchingCurrentCount=0;
  for(const item of raw){
    const result=checkpointObservationSchema.safeParse(item.data);
    if(!result.success||item.id!==result.data.replicaId||
       result.data.ownerUid!==candidate.ownerUid){
      throw new ObservationAuditBlocked('invalid-observation');
    }
    const row=result.data;
    if(byReplica.has(row.replicaId))throw new ObservationAuditBlocked('duplicate-observation');
    byReplica.add(row.replicaId);
    if(row.receiptCount>candidate.receiptCount||
       !prefixesCover(candidate.observedPrefixes,row.observedPrefixes)){
      throw new ObservationAuditBlocked('prefix-not-observed');
    }
    const key=canonicalPrefixes(row.observedPrefixes);
    const prior=byPrefix.get(key);
    if(prior!==undefined&&prior!==row.sha256){
      throw new ObservationAuditBlocked('digest-disagreement');
    }
    byPrefix.set(key,row.sha256);
    // Equality of full counts and covering prefix sums implies identical
    // contiguous prefixes because both schema objects sum to receiptCount.
    if(row.receiptCount===candidate.receiptCount){
      if(!sameObservation(row.observedPrefixes,candidate.observedPrefixes)||
         row.sha256!==candidate.sha256){
        throw new ObservationAuditBlocked('digest-disagreement');
      }
      matchingCurrentCount++;
    }
  }
  return {
    status:'audit-only',compactionAuthorized:false,
    ownerUid:candidate.ownerUid,candidateSha256:candidate.sha256,
    candidateReceiptCount:candidate.receiptCount,
    observationCount:raw.length,matchingCurrentCount,
    historicalCount:raw.length-matchingCurrentCount
  };
}

/**
 * Read-only and owner/session fenced. The two Firestore collection reads are
 * NOT an atomic cross-collection snapshot; concurrent server activity can make
 * this audit fail closed. Success remains an advisory consistency check ONLY.
 */
export async function inspectObservationAudit(
  repository:LocalGardenRepository,journal:CloudJournalReader,
  observations:CheckpointObservationReader,ownerUid:string,
  isStillAuthorized:()=>boolean,max=200
):Promise<ObservationAudit>{
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const before=await repository.read();
  if(!isStillAuthorized()||before.ownerScope!=='user:'+ownerUid){
    throw new ReconciliationBlocked('identity-changed');
  }
  const candidate=await inspectCheckpointCandidate(
    repository,journal,ownerUid,isStillAuthorized,max
  );
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const intermediate=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!sameObservation(intermediate,before)){
    throw new ReconciliationBlocked('concurrent-local-change');
  }
  let rows:readonly ObservationRow[];
  try{rows=await observations.readAll(ownerUid,max);}
  catch{throw new ObservationAuditBlocked('remote-unavailable');}
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const audit=buildObservationAudit(candidate,rows,max);
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const after=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!sameObservation(after,before)){
    throw new ReconciliationBlocked('concurrent-local-change');
  }
  return audit;
}
