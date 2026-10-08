import { z } from 'zod';
import {
  domainOperationSchema, emptyGarden, gardenStateSchema, type DomainOperation, type GardenState
} from '../domain/schema';
import { applyDomainOperation } from '../domain/operations';
import { cloudJournalRecordSchema } from '../cloud/protocol';

/**
 * M1 local-only durable repository. No Firestore calls, Auth wiring or persistent Firestore cache.
 * A single IDB record holds business state AND operation journal, avoiding split transactions.
 */
export const LOCAL_ENVELOPE_VERSION = 1;
export const LOCAL_DATA_SCHEMA_VERSION = 1;
export const OWNER_SCOPE = z.string().regex(/^(guest|user):[A-Za-z0-9_-]{1,96}$/);
const STORE = 'envelopes';
const DEFAULT_DB = 'piante-local-m1';
const MAX_PENDING = 2000;
const sequence = z.number().int().nonnegative().safe();

export const pendingOperationSchema = z.strictObject({
  sequence: sequence.positive(),
  operationId: z.string().min(1).max(160),
  appliedAt: sequence,
  operation: domainOperationSchema
});
export const localEnvelopeSchema = z.strictObject({
  envelopeVersion: z.literal(LOCAL_ENVELOPE_VERSION),
  dataSchemaVersion: z.literal(LOCAL_DATA_SCHEMA_VERSION),
  ownerScope: OWNER_SCOPE,
  replicaId: z.string().min(1).max(128),
  revision: sequence,
  lastSequence: sequence,
  data: gardenStateSchema,
  pending: z.array(pendingOperationSchema).max(MAX_PENDING),
  // Backward-compatible, optional extension; existing M1 envelopes migrate on next write.
  remoteReceipts: z.array(z.strictObject({id:z.string().min(1),data:cloudJournalRecordSchema})).max(200).default([])
}).superRefine((value,ctx)=>{
  let previous = value.pending.length ? value.pending[0].sequence - 1 : value.lastSequence;
  for(const entry of value.pending){
    if(entry.sequence !== previous + 1 || entry.operationId !== value.replicaId + ':' + entry.sequence){
      ctx.addIssue({code:'custom',message:'Journal non contiguo o operazione senza identità stabile'});
      break;
    }
    previous = entry.sequence;
  }
  if(previous !== value.lastSequence)ctx.addIssue({code:'custom',message:'Journal e sequence divergenti'});
  if(value.lastSequence > value.revision)ctx.addIssue({code:'custom',message:'Revision inferiore alla sequence'});
});

export type LocalEnvelope = z.infer<typeof localEnvelopeSchema>;
export type PendingOperation = z.infer<typeof pendingOperationSchema>;

function newReplicaId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Identificatore replica sicuro non disponibile');
  }
  return crypto.randomUUID();
}
function fresh(ownerScope:string):LocalEnvelope {
  return {
    ownerScope,replicaId:newReplicaId(),envelopeVersion:LOCAL_ENVELOPE_VERSION,
    dataSchemaVersion:LOCAL_DATA_SCHEMA_VERSION,revision:0,lastSequence:0,data:emptyGarden(),pending:[],remoteReceipts:[]
  };
}
function parseStored(raw:unknown,ownerScope:string):LocalEnvelope {
  if(raw===undefined)return fresh(ownerScope);
  const envelope=localEnvelopeSchema.parse(raw); // unknown future versions fail closed
  if(envelope.ownerScope!==ownerScope)throw new Error('Owner differente: operazione bloccata');
  return envelope;
}
function openDatabase(dbName:string):Promise<IDBDatabase> {
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB non disponibile'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(dbName,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);
    };
    request.onerror=()=>reject(request.error??new Error('Apertura IndexedDB fallita'));
    request.onblocked=()=>reject(new Error('Aggiornamento IndexedDB bloccato da altre schede'));
    request.onsuccess=()=>resolve(request.result);
  });
}

export class LocalGardenRepository {
  readonly ownerScope:string;
  constructor(
    ownerScope:string,
    private readonly options: {dbName?:string;now?:()=>number} = {}
  ) {
    this.ownerScope=OWNER_SCOPE.parse(ownerScope);
  }
  private get dbName():string{return this.options.dbName??DEFAULT_DB;}

  async read():Promise<LocalEnvelope>{
    const db=await openDatabase(this.dbName);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      let result:LocalEnvelope|undefined;
      let failure:unknown;
      tx.oncomplete=()=>{db.close();if(result)resolve(result);else reject(failure??new Error('Lettura incompleta'));};
      tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Lettura IndexedDB interrotta'));};
      const request=tx.objectStore(STORE).get(this.ownerScope);
      request.onsuccess=()=>{
        try{result=parseStored(request.result,this.ownerScope);}
        catch(error){failure=error;tx.abort();}
      };
    });
  }

  private async write<T>(mutate:(current:LocalEnvelope)=>{next:LocalEnvelope;value:T}):Promise<T>{
    const db=await openDatabase(this.dbName);
    return new Promise((resolve,reject)=>{
      // The read-modify-write is ONE transaction, serialized by IndexedDB across tabs.
      const tx=db.transaction(STORE,'readwrite');
      let value:T|undefined;
      let hasValue=false;
      let failure:unknown;
      tx.oncomplete=()=>{
        db.close();
        if(hasValue)resolve(value as T);
        else reject(failure??new Error('Commit IndexedDB non completato'));
      };
      tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Commit IndexedDB annullato'));};
      const request=tx.objectStore(STORE).get(this.ownerScope);
      request.onsuccess=()=>{
        try{
          const old=parseStored(request.result,this.ownerScope);
          const result=mutate(old);
          localEnvelopeSchema.parse(result.next);
          tx.objectStore(STORE).put(result.next,this.ownerScope);
          value=result.value;
          hasValue=true;
        }catch(error){
          failure=error;
          try{tx.abort();}catch{reject(error);}
        }
      };
    });
  }

  /** Durable transaction: operation and resulting domain state become visible together. */
  commit(rawOperation:unknown):Promise<LocalEnvelope>{
    const operation:DomainOperation=domainOperationSchema.parse(rawOperation);
    return this.write(current=>{
      if(current.pending.length>=MAX_PENDING)throw new Error('Journal pieno: sincronizzazione necessaria');
      if(current.lastSequence>=Number.MAX_SAFE_INTEGER)throw new Error('Sequence esaurita');
      const now=(this.options.now??Date.now)();
      const data:GardenState=applyDomainOperation(current.data,operation,now);
      const nextSequence=current.lastSequence+1;
      const pending:PendingOperation={
        sequence:nextSequence,operationId:current.replicaId+':'+nextSequence,
        appliedAt:now,operation
      };
      const next:LocalEnvelope={
        ...current, data, lastSequence:nextSequence,revision:current.revision+1,
        pending:[...current.pending,pending]
      };
      return {next,value:next};
    });
  }

  /**
   * Future cloud adapter only: acknowledge prefix after authoritative remote confirmation.
   * Never rewrites business data, so a concurrent local edit cannot be lost.
   */
  acknowledgeThrough(through:number):Promise<LocalEnvelope>{
    if(!Number.isSafeInteger(through)||through<0)throw new Error('Ack non valido');
    return this.write(current=>{
      if(through>current.lastSequence)throw new Error('Ack oltre la sequence locale');
      const pending=current.pending.filter(p=>p.sequence>through);
      const next={...current,pending,revision:current.revision+1};
      return {next,value:next};
    });
  }
  /**
   * CRITICAL: in-memory candidate and durable local snapshot must refer to the
   * SAME envelope. A read-only server scan cannot overwrite a concurrent IDB edit.
   * The projection is verified AGAIN inside the serialized IDB transaction.
   */
  persistRemoteSnapshot(
    expected: LocalEnvelope,
    rawRemote: readonly {id:string;data:unknown}[],
    project: (current:LocalEnvelope) => GardenState,
    isStillAuthorized: () => boolean
  ): Promise<LocalEnvelope> {
    return this.write(current=>{
      if(!isStillAuthorized())throw new Error('Identity changed before hydration');
      if(JSON.stringify(current)!==JSON.stringify(expected))throw new Error('Concurrent local change before hydration');
      const data=project(current);
      const remoteReceipts=rawRemote.map(item=>({
        id:item.id,
        data:cloudJournalRecordSchema.parse(item.data)
      }));
      const next:LocalEnvelope={
        ...current,data,remoteReceipts,revision:current.revision+1
      };
      return {next,value:next};
    });
  }

}
