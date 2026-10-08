import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import { prepareCloudRecord, type CloudJournalRecord, type CloudJournalPort } from './journal';
import { hydratePrivateJournal } from './hydration';
import { buildReconciliationPreview, type CloudJournalReader } from './reconciliationPreview';

let number=0;
const source=(dbName?:string,uid='alice')=>new LocalGardenRepository('user:'+uid,{
  dbName:dbName??'m2d-hydration-'+(++number),now:()=>1000
});
const create=(id:string)=>({
  type:'plant.create',plant:{id,commonName:id,origin:'seed',status:'active'}
});
const note=(id:string,value:string)=>({
  type:'plant.patch',id,patch:{notes:value}
});
const journal=()=>{
  const entries=new Map<string,CloudJournalRecord>();
  const port:CloudJournalPort={
    async appendOnce(item){
      const before=entries.get(item.operationId);
      if(before&&JSON.stringify(before)!==JSON.stringify(item))throw new Error('identity collision');
      entries.set(item.operationId,item);
      return before?'duplicate':'created';
    }
  };
  const reader:CloudJournalReader={
    async readAll(uid){
      return [...entries.values()].filter(row=>row.ownerUid===uid)
        .map(row=>({id:row.operationId,data:row}));
    }
  };
  return {entries,port,reader};
};
async function upload(repo:LocalGardenRepository,port:CloudJournalPort){
  const envelope=await repo.read();
  for(const pending of envelope.pending){
    await port.appendOnce(prepareCloudRecord('alice',envelope,pending));
  }
}
afterEach(()=>vi.restoreAllMocks());

describe('M2d durable cross-device hydration (CRITICAL)',()=>{
  it('recovers a newly opened device from the cloud and retains an offline snapshot across reloads',async()=>{
    const upstream=source(),downstreamDb='m2d-new-device-'+(++number);
    const downstream=source(downstreamDb),remote=journal();
    await upstream.commit(create('avocado_bacon'));
    await upload(upstream,remote.port);
    expect((await downstream.read()).data.plants.avocado_bacon).toBeUndefined();
    const synced=await hydratePrivateJournal(downstream,remote.reader,'alice',()=>true);
    expect(synced.status).toBe('hydrated-locally');
    expect(synced.locallyPendingCount).toBe(0);
    expect((await source(downstreamDb).read()).data.plants.avocado_bacon.commonName)
      .toBe('avocado_bacon');
    expect((await downstream.read()).remoteReceipts).toHaveLength(1);
  });

  it('safely reconciles two independent devices, then permits an offline edit to a restored plant',async()=>{
    const a=source(),b=source(),remote=journal();
    await a.commit(create('feijoa'));
    await upload(a,remote.port);
    await hydratePrivateJournal(b,remote.reader,'alice',()=>true);
    await b.commit({type:'event.add',event:{
      id:'flower1',plantId:'feijoa',date:'2026-10-08',type:'flowering'
    }});
    expect((await b.read()).data.events.flower1).toBeDefined();
    await upload(b,remote.port);
    await hydratePrivateJournal(a,remote.reader,'alice',()=>true);
    const storedA=await a.read();
    expect(storedA.data.events.flower1).toBeDefined();
    expect(storedA.pending).toHaveLength(1); // never silently acknowledge uploads
    expect(storedA.remoteReceipts).toHaveLength(2);
    await hydratePrivateJournal(b,remote.reader,'alice',()=>true);
    expect((await b.read()).data).toEqual(storedA.data);
  });

  it('never overwrites concurrent edits to the same field',async()=>{
    const founder=source(),deviceB=source(),deviceC=source(),remote=journal();
    await founder.commit(create('papaya'));
    await upload(founder,remote.port);
    await hydratePrivateJournal(deviceB,remote.reader,'alice',()=>true);
    await hydratePrivateJournal(deviceC,remote.reader,'alice',()=>true);
    await deviceB.commit(note('papaya','first'));
    await deviceC.commit(note('papaya','second'));
    await upload(deviceB,remote.port);
    await upload(deviceC,remote.port);
    const before=await deviceB.read();
    await expect(hydratePrivateJournal(deviceB,remote.reader,'alice',()=>true))
      .rejects.toMatchObject({reason:'conflicting-writes'});
    expect(await deviceB.read()).toEqual(before);
    expect((await deviceC.read()).pending).toHaveLength(1);
  });

  it('refuses a stale cloud scan instead of removing previously restored receipts',async()=>{
    const origin=source(),device=source(),remote=journal();
    await origin.commit(create('guava'));
    await upload(origin,remote.port);
    await hydratePrivateJournal(device,remote.reader,'alice',()=>true);
    const before=await device.read();
    await expect(hydratePrivateJournal(device,{readAll:async()=>[]},'alice',()=>true))
      .rejects.toMatchObject({reason:'history-gap'});
    expect(await device.read()).toEqual(before);
  });

  it('fails closed if a local edit happens during the cloud read',async()=>{
    const repo=source(),remote=journal();
    await repo.commit(create('dragon'));
    const before=await repo.read();
    const reader:CloudJournalReader={readAll:async()=>{
      await repo.commit(create('dragon2')); return [];
    }};
    await expect(hydratePrivateJournal(repo,reader,'alice',()=>true))
      .rejects.toMatchObject({reason:'concurrent-local-change'});
    expect((await repo.read()).data.plants.dragon2).toBeDefined();
    expect((await repo.read()).remoteReceipts).toHaveLength(0);
    expect((await repo.read()).revision).toBe(before.revision+1);
    expect(remote.entries.size).toBe(0);
  });

  it('preserves the old envelope if IndexedDB fails while committing a hydrated projection',async()=>{
    const origin=source(),target=source(),remote=journal();
    await origin.commit(create('mamey'));
    await upload(origin,remote.port);
    const before=await target.read();
    const spy=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementationOnce(()=>{
      throw new Error('Injected disk failure');
    });
    await expect(hydratePrivateJournal(target,remote.reader,'alice',()=>true))
      .rejects.toThrow('Injected disk failure');
    spy.mockRestore();
    expect(await target.read()).toEqual(before);
  });

  it('refuses to write after account revocation and never returns a false success',async()=>{
    const origin=source(),target=source(),remote=journal();
    await origin.commit(create('sapote'));await upload(origin,remote.port);
    let checks=0;
    const authorized=()=>++checks<4; // read start, after cloud, before tx, then txn fails
    await expect(hydratePrivateJournal(target,remote.reader,'alice',authorized))
      .rejects.toMatchObject({reason:'identity-changed'});
    expect((await target.read()).remoteReceipts).toHaveLength(0);
  });

  it('keeps a locally committed journal readable when migrating an existing M1 envelope',async()=>{
    const repo=source();
    await repo.commit(create('old'));
    const envelope=await repo.read();
    expect(envelope.remoteReceipts).toEqual([]);
    const old={...envelope} as Record<string,unknown>;
    delete old.remoteReceipts;
    expect(buildReconciliationPreview('alice',[],old).data.plants.old).toBeDefined();
    expect((await repo.read()).data.plants.old).toBeDefined();
  });
});
