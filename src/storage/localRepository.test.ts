import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyGarden } from '../domain/schema';
import { replayOperations } from '../domain/operations';
import { LocalGardenRepository } from './localRepository';

let counter=0;
const dbName=()=> 'piante-m1-test-'+(++counter);
const avocado=(id:string)=>({type:'plant.create',plant:{id,commonName:'Avocado',origin:'seed',status:'active'}}) as const;
const instance=(name:string,owner='user:alice',now=100)=>
  new LocalGardenRepository(owner,{dbName:name,now:()=>now});

afterEach(()=>vi.restoreAllMocks());
describe('IndexedDB atomic state + operation journal (CRITICAL)',()=>{
  it('creates a single durable replica identity even on a read-only first launch',async()=>{
    const db=dbName();
    const first=await instance(db).read();
    const second=await instance(db).read();
    expect(second.replicaId).toBe(first.replicaId);
    expect(second).toEqual(first);
    expect((await instance(db).commit(avocado('p1'))).replicaId).toBe(first.replicaId);
  });
  it('serializes two first-time readers without changing the replica identity',async()=>{
    const db=dbName();
    const [a,b]=await Promise.all([instance(db).read(),instance(db).read()]);
    expect(a.replicaId).toBe(b.replicaId);
    expect((await instance(db).read()).replicaId).toBe(a.replicaId);
  });
  it('compares all values in CAS but ignores object key enumeration order',async()=>{
    const repo=instance(dbName());
    const current=await repo.read();
    const equivalent={
      ...current,
      data:{events:current.data.events,places:current.data.places,plants:current.data.plants}
    };
    const next=await repo.persistRemoteSnapshot(equivalent,[],state=>state.data,()=>true);
    expect(next.revision).toBe(current.revision+1);
    await expect(repo.persistRemoteSnapshot(current,[],state=>state.data,()=>true))
      .rejects.toThrow('Concurrent local change');
  });
  it('persists state, sequence, ID and operations across repository restarts',async()=>{
    const db=dbName();
    const first=await instance(db).commit(avocado('p1'));
    expect(first.pending).toHaveLength(1);
    expect(first.pending[0].operationId).toBe(first.replicaId+':1');
    const recovered=await instance(db).read();
    expect(recovered).toEqual(first);
    expect(replayOperations(emptyGarden(),recovered.pending)).toEqual(recovered.data);
    expect(recovered.data.plants.p1.commonName).toBe('Avocado');
  });
  it('serializes concurrent edits even from separate repository instances',async()=>{
    const db=dbName();
    await Promise.all([instance(db).commit(avocado('a')),instance(db).commit(avocado('b'))]);
    const recovered=await instance(db).read();
    expect(Object.keys(recovered.data.plants).sort()).toEqual(['a','b']);
    expect(recovered.lastSequence).toBe(2);
    expect(recovered.pending.map(p=>p.sequence)).toEqual([1,2]);
    expect(replayOperations(emptyGarden(),recovered.pending)).toEqual(recovered.data);
  });
  it('rejects invalid operation without changing data, sequence or journal',async()=>{
    const db=dbName();
    const repo=instance(db);
    const before=await repo.commit(avocado('p1'));
    await expect(repo.commit(avocado('p1'))).rejects.toThrow('duplicato');
    await expect(repo.commit({type:'plant.patch',id:'p1',patch:{motherId:'unknown'}})).rejects.toThrow();
    expect(await repo.read()).toEqual(before);
  });
  it('rolls back a simulated IDB put failure atomically',async()=>{
    const db=dbName();
    const repo=instance(db);
    const before=await repo.commit(avocado('p1'));
    const original=IDBObjectStore.prototype.put;
    const spy=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementationOnce(function(this:IDBObjectStore){
      throw new Error('Injected write failure');
    });
    await expect(repo.commit(avocado('p2'))).rejects.toThrow('Injected write failure');
    spy.mockRestore();
    expect(await repo.read()).toEqual(before);
    expect(original).toBeDefined();
  });
  it('acknowledges only a verified prefix without overwriting newer local edits',async()=>{
    const db=dbName();
    const repo=instance(db);
    await repo.commit(avocado('a'));
    await repo.commit(avocado('b'));
    const before=await repo.read();
    const ack=await repo.acknowledgeThrough(1);
    expect(ack.data).toEqual(before.data);
    expect(ack.pending.map(p=>p.sequence)).toEqual([2]);
    expect(ack.lastSequence).toBe(2);
    expect((await repo.read()).pending).toEqual(ack.pending);
    await expect(repo.acknowledgeThrough(3)).rejects.toThrow('oltre');
  });
  it('keeps owners isolated within the same browser database',async()=>{
    const db=dbName();
    await instance(db,'user:alice').commit(avocado('alice1'));
    const bob=await instance(db,'user:bob').read();
    expect(Object.keys(bob.data.plants)).toHaveLength(0);
    expect((await instance(db,'user:alice').read()).data.plants.alice1).toBeDefined();
  });
  it('fails closed for unknown future schema versions without resetting data',async()=>{
    const db=dbName();
    const repo=instance(db);
    const baseline=await repo.commit(avocado('a'));
    await new Promise<void>((resolve,reject)=>{
      const req=indexedDB.open(db,1);
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const connection=req.result;
        const tx=connection.transaction('envelopes','readwrite');
        tx.objectStore('envelopes').put({...baseline,envelopeVersion:99},'user:alice');
        tx.oncomplete=()=>{connection.close();resolve();};
        tx.onabort=()=>{connection.close();reject(tx.error);};
      };
    });
    await expect(repo.read()).rejects.toThrow();
    await expect(repo.commit(avocado('b'))).rejects.toThrow();
  });
  it('reports IndexedDB unavailability instead of silently succeeding',async()=>{
    const repo=instance(dbName());
    vi.stubGlobal('indexedDB',undefined);
    try {
      await expect(repo.commit(avocado('a'))).rejects.toThrow('non disponibile');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
