import { type LocalEnvelope, LocalGardenRepository } from '../storage/localRepository';
import {
  buildReconciliationPreview, ReconciliationBlocked,
  MAX_PREVIEW_OPERATIONS, type CloudJournalReader
} from './reconciliationPreview';

/**
 * Opt-in laboratory hydration. A verified remote set and the derived projection
 * are persisted in the SAME IndexedDB transaction, guarded by a full CAS.
 * Upload (M2b) is a separate idempotent phase; no cloud rules are deployed here.
 */
export type HydrationResult = {
  status:'hydrated-locally';
  dataRevision:number;
  remoteCount:number;
  locallyPendingCount:number;
};

export async function hydratePrivateJournal(
  repository:LocalGardenRepository,
  reader:CloudJournalReader,
  ownerUid:string,
  isStillAuthorized:()=>boolean,
  max=MAX_PREVIEW_OPERATIONS
):Promise<HydrationResult> {
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!Number.isSafeInteger(max)||max<1||max>MAX_PREVIEW_OPERATIONS) {
    throw new ReconciliationBlocked('limit-exceeded');
  }
  const before:LocalEnvelope=await repository.read();
  if(before.ownerScope!=='user:'+ownerUid)throw new ReconciliationBlocked('identity-changed');
  let remote:readonly {id:string;data:unknown}[];
  try{remote=await reader.readAll(ownerUid,max);}
  catch(error) {
    if(error instanceof ReconciliationBlocked)throw error;
    throw new ReconciliationBlocked('remote-unavailable');
  }
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  // Validate all data and detect potential conflicts before opening an IDB
  // transaction; repeat the full check synchronously in the write transaction.
  const preview=buildReconciliationPreview(ownerUid,remote,before,max);
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  let stored:LocalEnvelope;
  try {
    stored=await repository.persistRemoteSnapshot(
      before, remote,
      current=>buildReconciliationPreview(ownerUid,remote,current,max).data,
      isStillAuthorized
    );
  }catch(error){
    if(error instanceof ReconciliationBlocked)throw error;
    if(error instanceof Error&&/Identity changed/.test(error.message)) {
      throw new ReconciliationBlocked('identity-changed');
    }
    if(error instanceof Error&&/Concurrent local change/.test(error.message)) {
      throw new ReconciliationBlocked('concurrent-local-change');
    }
    throw error; // IndexedDB/quota/corrupt data failure MUST be observable.
  }
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  return {
    status:'hydrated-locally',
    dataRevision:stored.revision,
    remoteCount:preview.remoteCount,
    locallyPendingCount:stored.pending.length
  };
}
