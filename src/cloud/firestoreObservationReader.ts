import { collection, getDocsFromServer, limit, query, type Firestore } from 'firebase/firestore';
import { uidSchema } from './protocol';
import {
  ObservationAuditBlocked, type CheckpointObservationReader
} from './observationAudit';

/** Bounded, complete, server-only read of owner-private advisory observations. */
export function firestoreObservationReader(db:Firestore):CheckpointObservationReader{
  return {
    async readAll(ownerUid,max=200){
      if(!uidSchema.safeParse(ownerUid).success){
        throw new ObservationAuditBlocked('invalid-observation');
      }
      if(!Number.isSafeInteger(max)||max<1||max>200){
        throw new ObservationAuditBlocked('limit-exceeded');
      }
      const ref=collection(db,'piante_users',ownerUid,'checkpoint_observations');
      const result=await getDocsFromServer(query(ref,limit(max+1)));
      if(result.size>max)throw new ObservationAuditBlocked('limit-exceeded');
      return result.docs.map(row=>({id:row.id,data:row.data() as unknown}));
    }
  };
}
