import { type LocalGardenRepository } from '../storage/localRepository';
import {
  missingRemoteReceipts, uploadPendingJournal, type CloudJournalPort
} from './journal';
import { hydratePrivateJournal } from './hydration';
import {
  MAX_PREVIEW_OPERATIONS, ReconciliationBlocked, type CloudJournalReader
} from './reconciliationPreview';

/**
 * M2e laboratory orchestration only. No background scheduling or UI wiring.
 * The name intentionally does not claim fully causal/global synchronization.
 */
export type JournalCycleResult =
 | {status:'verified-receipts-journal-retained';uploadedInCycle:number;remoteCount:number;localPendingCount:number}
 | {status:'retry-required';uploadedInCycle:number;reason:'cloud-not-confirmed'|'network-ambiguous'}
 | {status:'blocked';uploadedInCycle:number;reason:'permission-denied'|'identity-changed'|'local-invariant'};

export async function runPrivateJournalCycle(
  repository:LocalGardenRepository,
  reader:CloudJournalReader,
  writer:CloudJournalPort,
  ownerUid:string,
  isStillAuthorized:()=>boolean
):Promise<JournalCycleResult>{
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');

  // First reconcile everything the server knows; conflicts must be detected
  // BEFORE uploading divergent local intents.
  await hydratePrivateJournal(repository,reader,ownerUid,isStillAuthorized);
  let uploadedInCycle=0;
  // Max 200 receipts total, max 20 per remote transaction batch.
  for(let round=0;round<=MAX_PREVIEW_OPERATIONS/20;round++){
    if(!isStillAuthorized())return {status:'blocked',uploadedInCycle,reason:'identity-changed'};
    const before=await repository.read();
    const outstanding=missingRemoteReceipts(ownerUid,before);
    if(outstanding.length===0){
      return {status:'verified-receipts-journal-retained',uploadedInCycle,
        remoteCount:before.remoteReceipts.length,localPendingCount:before.pending.length};
    }
    const capacity=MAX_PREVIEW_OPERATIONS-before.remoteReceipts.length;
    if(capacity<=0)throw new ReconciliationBlocked('limit-exceeded');
    const batchSize=Math.min(capacity,20,outstanding.length);
    const upload=await uploadPendingJournal(repository,writer,ownerUid,isStillAuthorized,batchSize);
    if(upload.status==='failed')return {status:'blocked',uploadedInCycle:uploadedInCycle+upload.count,
      reason:upload.reason==='identity-changed'?'identity-changed':'local-invariant'};
    if(upload.status==='rejected')return {status:'blocked',uploadedInCycle:uploadedInCycle+upload.count,
      reason:'permission-denied'};
    const justUploaded=upload.status==='uploaded-awaiting-reconciliation'||upload.status==='local-pending'
      ?upload.count:0;
    uploadedInCycle+=justUploaded;
    if(!isStillAuthorized())return {status:'blocked',uploadedInCycle,reason:'identity-changed'};
    try {
      await hydratePrivateJournal(repository,reader,ownerUid,isStillAuthorized);
    }catch(error){
      if(error instanceof ReconciliationBlocked&&error.reason==='remote-unavailable'){
        // Ambiguous transport: existing local journal survives unchanged.
        return {status:'retry-required',uploadedInCycle,reason:'network-ambiguous'};
      }
      throw error;
    }
    const after=await repository.read();
    if(!isStillAuthorized())return {status:'blocked',uploadedInCycle,reason:'identity-changed'};
    if(missingRemoteReceipts(ownerUid,after).length>=outstanding.length){
      // Server has not confirmed the new receipt, or a new local edit was
      // committed during upload. Never pretend the batch was synced.
      return {status:'retry-required',uploadedInCycle,reason:'cloud-not-confirmed'};
    }
  }
  throw new ReconciliationBlocked('limit-exceeded');
}
