import { doc, onSnapshot, type Firestore } from 'firebase/firestore';

/**
 * An authenticated UID plus a cached Firestore grant is NOT authorization.
 * Include metadata changes so a cached/offline transition immediately hides
 * the owner view. Read-only; clients cannot provision grants.
 */
export function watchServerGrant(
  db:Firestore,uid:string,listener:(enabled:boolean|null,error?:Error)=>void
):()=>void {
  if(!/^[A-Za-z0-9_-]{1,96}$/.test(uid))throw new Error('UID non valido');
  return onSnapshot(doc(db,'piante_access',uid),
    {includeMetadataChanges:true},
    snapshot=>{
      if(snapshot.metadata.fromCache){
        listener(null);
        return;
      }
      listener(snapshot.exists()&&snapshot.data().enabled===true);
    },
    ()=>listener(null,new Error('Grant listener failed'))
  );
}
