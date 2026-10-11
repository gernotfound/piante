import { doc, getDocFromServer, runTransaction, type Firestore } from 'firebase/firestore';
import { checkpointObservationSchema, CheckpointObservationConflict, prefixesCover, sameObservation, type CheckpointObservationPort } from './checkpointObservation';

export function firestoreCheckpointObservationPort(db:Firestore):CheckpointObservationPort {
  return { async saveAndVerify(input) {
    const next=checkpointObservationSchema.parse(input);
    const ref=doc(db,'piante_users',next.ownerUid,'checkpoint_observations',next.replicaId);
    const outcome=await runTransaction(db,async tx=>{
      const snapshot=await tx.get(ref);
      if(!snapshot.exists()){
        tx.set(ref,next);return 'created' as const;
      }
      const result=checkpointObservationSchema.safeParse(snapshot.data());
      if(!result.success)throw new CheckpointObservationConflict();
      const old=result.data;
      if(old.ownerUid!==next.ownerUid||old.replicaId!==next.replicaId||
        next.receiptCount<old.receiptCount||!prefixesCover(next.observedPrefixes,old.observedPrefixes)){
        throw new CheckpointObservationConflict();
      }
      if(next.receiptCount===old.receiptCount){
        if(!sameObservation(old,next))throw new CheckpointObservationConflict();
        return 'duplicate' as const;
      }
      tx.update(ref,next);
      return 'advanced' as const;
    },{maxAttempts:5});
    const saved=await getDocFromServer(ref);
    const parsed=checkpointObservationSchema.safeParse(saved.data());
    if(!saved.exists()||!parsed.success||!sameObservation(parsed.data,next)){
      throw new CheckpointObservationConflict();
    }
    return outcome;
  }};
}
