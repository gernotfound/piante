/**
 * M3c LAB ONLY — trusted-boundary contract for deleting Piante-owned data.
 *
 * No production adapter, Firebase Admin SDK, HTTP route or Auth deletion exists.
 * Firebase Auth is shared with legacy Pianta; it MUST NEVER be deleted here.
 * Never instantiate this runner with a client Firestore SDK.
 */
const UID = /^[A-Za-z0-9_-]{1,96}$/;
const ALLOWED_PRIVATE_COLLECTIONS = new Set(['operations']);
export const MAX_DELETE_BATCH = 50;

export type DeletionStep =
  | {status:'busy'}
  | {status:'incomplete'; deleted:number}
  | {status:'piante-data-cleared'; deleted:number};

export interface TrustedDeletionPort {
  /**
   * Must atomically create/retain a server-only deletion tombstone and acquire
   * an exclusive expiring lease. If already complete, return 'complete'.
   */
  begin(uid:string):Promise<'acquired'|'busy'|'complete'>;
  /**
   * Must enumerate ALL cloud namespace dependencies, including public aliases,
   * published projections, Storage objects and future Piante-owned resources.
   * Return false when completeness cannot be established. Fail before deletion.
   */
  noExternalArtifacts(uid:string):Promise<boolean>;
  /** Admin listCollections(), not a hardcoded listing or ordinary client query. */
  listPrivateCollections(uid:string):Promise<readonly string[]>;
  /** Bounded query from the BEGINNING, even after interrupted prior batches. */
  listDocumentIds(uid:string,collection:string,max:number):Promise<readonly string[]>;
  /** Trusted server-only deletion; must be idempotent after ambiguous timeouts. */
  deleteDocuments(uid:string,collection:string,ids:readonly string[]):Promise<void>;
  /** Delete only piante_users/{uid} root, never legacy users/{uid}. */
  deletePrivateRoot(uid:string):Promise<void>;
  /** Verify root absent, all known child collections empty, no unknown children. */
  verifyPrivateEmpty(uid:string):Promise<boolean>;
  /** Delete ONLY piante_access/{uid}, not the shared Firebase Auth identity. */
  deleteGrant(uid:string):Promise<void>;
  /** Authoritative proof the Piante-only grant no longer exists. */
  verifyGrantGone(uid:string):Promise<boolean>;
  /** Durable completion marker; never remove the deletion barrier. */
  markComplete(uid:string):Promise<void>;
  /** Release lease only. MUST preserve tombstone on every failure. */
  release(uid:string):Promise<void>;
}

function validateUid(uid:string):void {
  if(!UID.test(uid))throw new Error('Invalid deletion UID');
}
/**
 * One bounded administrative work unit. It never claims account deletion:
 * only Piante-private namespace cleanup, after explicit trusted authorization.
 * Caller is responsible for recent-auth, App Check, authorized user consent,
 * verified provider configuration and idempotent job persistence.
 */
export async function runPianteDeletionStep(
  port:TrustedDeletionPort,
  uid:string,
  maximum=MAX_DELETE_BATCH
):Promise<DeletionStep> {
  validateUid(uid);
  if(!Number.isSafeInteger(maximum)||maximum<1||maximum>MAX_DELETE_BATCH){
    throw new Error('Invalid deletion budget');
  }
  const acquired=await port.begin(uid);
  if(acquired==='busy')return {status:'busy'};
  if(acquired==='complete'){
    // Never trust a bare job status when deleted data might have been recreated.
    if(!await port.noExternalArtifacts(uid) || !await port.verifyPrivateEmpty(uid) || !await port.verifyGrantGone(uid)){
      throw new Error('Deletion completion proof contradicted by cloud state');
    }
    return {status:'piante-data-cleared',deleted:0};
  }
  try{
    if(!await port.noExternalArtifacts(uid)){
      throw new Error('Unknown public, Storage, or other account artifacts: deletion blocked');
    }
    const collections=await port.listPrivateCollections(uid);
    if(new Set(collections).size!==collections.length ||
      collections.some(name=>!ALLOWED_PRIVATE_COLLECTIONS.has(name))){
      throw new Error('Unknown or duplicate Piante private collections: deletion blocked');
    }
    let deleted=0;
    for(const collection of collections){
      const capacity=maximum-deleted;
      // Read capacity+1 to detect that another page remains; delete at most
      // capacity. A legitimate full collection MUST NOT be mistaken for
      // an unbounded query merely because it contains the sentinel item.
      const page=await port.listDocumentIds(uid,collection,capacity+1);
      if(page.length>capacity+1 || new Set(page).size!==page.length ||
        page.some(id=>!id || id.includes('/'))){
        throw new Error('Unbounded or invalid deletion page: deletion blocked');
      }
      const ids=page.slice(0,capacity);
      if(ids.length){
        await port.deleteDocuments(uid,collection,ids);
        deleted+=ids.length;
        // A bounded retry must never delete from a different collection after
        // consuming its entire budget; keep the server tombstone live.
        return {status:'incomplete',deleted};
      }
    }
    await port.deletePrivateRoot(uid);
    if(!await port.verifyPrivateEmpty(uid)){
      throw new Error('Cloud private data still present after cleanup');
    }
    await port.deleteGrant(uid);
    if(!await port.verifyGrantGone(uid) || !await port.verifyPrivateEmpty(uid)){
      throw new Error('Piante-only deletion not yet verified');
    }
    await port.markComplete(uid);
    return {status:'piante-data-cleared',deleted};
  }finally{
    // Failure here must also surface; NEVER erase or reinterpret job state.
    await port.release(uid);
  }
}
