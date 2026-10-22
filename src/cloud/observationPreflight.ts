import { inspectCheckpointCandidate } from './checkpointCandidate';
import { inspectObservationAudit, type ObservationReader } from './observationAudit';
import { prefixesCover, sameObservation } from './checkpointObservation';
import { ReconciliationBlocked, type CloudJournalReader } from './reconciliationPreview';
import { type LocalGardenRepository } from '../storage/localRepository';

/** No remote observation can prove causal finality, even after this cross-check. */
export class ObservationPreflightBlocked extends Error{
  constructor(readonly reason:'prefix-ahead'|'digest-disagreement'|'remote-changed'){
    super('Preflight osservazioni bloccato: '+reason);
    this.name='ObservationPreflightBlocked';
  }
}
export type ObservationPreflight={
  readonly status:'cross-check-only';
  readonly compactionAuthorized:false;
  readonly ownerUid:string;
  readonly receiptCount:number;
  readonly observationCount:number;
  readonly matchingCurrentCount:number;
  readonly historicalCount:number;
};

/**
 * Contrast advisory observations with a verified full *bounded* journal scan,
 * not just with other client-generated attestations. The two server queries
 * are NOT atomic; the journal is re-read afterward to reject observed
 * changes DURING the audit window, but this cannot prevent later writes.
 * All results remain non-authoritative for GC/recovery.
 */
export async function inspectObservationPreflight(
  repository:LocalGardenRepository,journal:CloudJournalReader,
  observations:ObservationReader,ownerUid:string,
  isStillAuthorized:()=>boolean,max=200
):Promise<ObservationPreflight>{
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const before=await repository.read();
  if(!isStillAuthorized()||before.ownerScope!=='user:'+ownerUid){
    throw new ReconciliationBlocked('identity-changed');
  }
  // This already requires every local pending operation to have its exact
  // receipt and verifies Auth, full IDB envelope, replay, and SHA-256.
  const candidate=await inspectCheckpointCandidate(
    repository,journal,ownerUid,isStillAuthorized,max
  );
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const middle=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!sameObservation(before,middle)){
    throw new ReconciliationBlocked('concurrent-local-change');
  }
  const audit=await inspectObservationAudit(
    observations,ownerUid,isStillAuthorized,max
  );
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  // Even a matching pair of fabricated clients is not an acceptable
  // positive audit: their assertions must be consistent with the CURRENT
  // server-receipt candidate, and not claim unseen operations.
  if(audit.discrepancies.length){
    throw new ObservationPreflightBlocked('digest-disagreement');
  }
  let matchingCurrentCount=0;
  for(const item of audit.observations){
    if(item.receiptCount>candidate.receiptCount||
       !prefixesCover(candidate.observedPrefixes,item.observedPrefixes)){
      throw new ObservationPreflightBlocked('prefix-ahead');
    }
    // Both sums equal, and observedPrefixes is fully covered: every prefix
    // must equal the candidate prefix. Equal history requires equal digest.
    if(item.receiptCount===candidate.receiptCount){
      if(!sameObservation(item.observedPrefixes,candidate.observedPrefixes)||
         item.sha256!==candidate.sha256){
        throw new ObservationPreflightBlocked('digest-disagreement');
      }
      matchingCurrentCount++;
    }
  }
  // Reject an intervening local edit BEFORE the extra server request,
  // so the real concurrent-IDB cause cannot be masked as an unconfirmed
  // pending operation discovered by the second journal candidate.
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const intermediate=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!sameObservation(before,intermediate)){
    throw new ReconciliationBlocked('concurrent-local-change');
  }
  // A journal append/rewrite BETWEEN the two server collection reads
  // invalidates the candidate. This is a second FULL server scan, not a
  // transaction or proof that the remote history cannot change afterward.
  // The extra read cost is acceptable only in this bounded laboratory path.
  const rechecked=await inspectCheckpointCandidate(
    repository,journal,ownerUid,isStillAuthorized,max
  );
  if(!sameObservation(candidate,rechecked)){
    throw new ObservationPreflightBlocked('remote-changed');
  }
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const after=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!sameObservation(before,after)){
    throw new ReconciliationBlocked('concurrent-local-change');
  }
  return {
    status:'cross-check-only',compactionAuthorized:false,
    ownerUid,
    receiptCount:candidate.receiptCount,
    observationCount:audit.observations.length,
    matchingCurrentCount,historicalCount:audit.observations.length-matchingCurrentCount
  };
}
