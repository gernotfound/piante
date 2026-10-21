import { collection, getDocsFromServer, limit, query, type Firestore } from 'firebase/firestore';
import { MAX_OBSERVATIONS, type ObservationReader } from './observationAudit';
import { ReconciliationBlocked } from './reconciliationPreview';
import { uidSchema } from './protocol';

/** Bounded complete server query: no local-cache fallback or silent truncation. */
export function firestoreObservationReader(db:Firestore):ObservationReader{
  return {async readAll(ownerUid,max=MAX_OBSERVATIONS){
    if(!uidSchema.safeParse(ownerUid).success)throw new ReconciliationBlocked('identity-changed');
    if(!Number.isSafeInteger(max)||max<1||max>MAX_OBSERVATIONS){
      throw new ReconciliationBlocked('limit-exceeded');
    }
    const ref=collection(db,'piante_users',ownerUid,'checkpoint_observations');
    const snapshot=await getDocsFromServer(query(ref,limit(max+1)));
    if(snapshot.size>max)throw new ReconciliationBlocked('limit-exceeded');
    return snapshot.docs.map(row=>({id:row.id,data:row.data() as unknown}));
  }};
}
