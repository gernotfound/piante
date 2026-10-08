import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import {
  prepareCloudRecord, uploadPendingJournal, type CloudJournalRecord, type CloudJournalPort
} from './journal';
import { hydratePrivateJournal } from './hydration';
import { runPrivateJournalCycle } from './cycle';
import { type CloudJournalReader } from './reconciliationPreview';

let index=0;
const repo=()=>new LocalGardenRepository('user:alice',{
  dbName:'m2e-cycle-'+(++index),now:()=>1000
});
const plant=(id:string)=>({type:'plant.create',plant:{
  id,commonName:id,origin:'seed',status:'active'
}}) as const;
function store(){
  const records=new Map<string,CloudJournalRecord>();
  let calls=0;
  const writer:CloudJournalPort={appendOnce:async item=>{
    calls++;
    const old=records.get(item.operationId);
    if(old&&JSON.stringify(old)!==JSON.stringify(item))throw new Error('collision');
    records.set(item.operationId,item);
    return old?'duplicate':'created';
  }};
  const reader:CloudJournalReader={readAll:async(uid)=>{
    return [...records.values()].filter(x=>x.ownerUid===uid)
      .map(data=>({id:data.operationId,data}));
  }};
  return {records,writer,reader,get calls(){return calls;}};
}
describe('M2e bounded upload + server confirmation orchestrator (CRITICAL)',()=>{
  it('uploads 45 separate intents in batches without re-uploading earlier verified receipts',async()=>{
    const local=repo(),remote=store();
    for(let i=0;i<45;i++)await local.commit(plant('plant'+i));
    const result=await runPrivateJournalCycle(local,remote.reader,remote.writer,'alice',()=>true);
    expect(result).toEqual({
      status:'verified-receipts-journal-retained',uploadedInCycle:45,
      remoteCount:45,localPendingCount:45
    });
    expect(remote.calls).toBe(45);
    expect(remote.records.size).toBe(45);
    expect((await local.read()).remoteReceipts).toHaveLength(45);
    expect((await local.read()).pending).toHaveLength(45);
    const second=await runPrivateJournalCycle(local,remote.reader,remote.writer,'alice',()=>true);
    expect(second).toMatchObject({status:'verified-receipts-journal-retained',uploadedInCycle:0});
    expect(remote.calls).toBe(45); // no duplicate writes
  });

  it('an ambiguous timeout after server commit is recovered by server re-read, not by unsafe local ack',async()=>{
    const local=repo(),remote=store();
    await local.commit(plant('guava'));
    let first=true;
    const writer:CloudJournalPort={appendOnce:async row=>{
      const result=await remote.writer.appendOnce(row);
      if(first){first=false;throw new Error('network lost after server commit');}
      return result;
    }};
    expect(await runPrivateJournalCycle(local,remote.reader,writer,'alice',()=>true))
      .toMatchObject({status:'verified-receipts-journal-retained',remoteCount:1,localPendingCount:1});
    expect((await local.read()).pending).toHaveLength(1);
    expect(remote.calls).toBe(1);
  });

  it('never claims remote confirmation if a server read omits the newly uploaded receipt',async()=>{
    const local=repo(),remote=store();
    await local.commit(plant('avocado'));
    const stale:CloudJournalReader={readAll:async()=>[]};
    const result=await runPrivateJournalCycle(local,stale,remote.writer,'alice',()=>true);
    expect(result).toEqual({status:'retry-required',uploadedInCycle:1,reason:'cloud-not-confirmed'});
    expect((await local.read()).pending).toHaveLength(1);
    expect((await local.read()).remoteReceipts).toHaveLength(0);
  });

  it('will not access cloud after the user loses authorization during upload',async()=>{
    const local=repo(),remote=store();
    await local.commit(plant('papaya'));
    let authorized=true;
    const writer:CloudJournalPort={appendOnce:async row=>{
      authorized=false;
      return remote.writer.appendOnce(row);
    }};
    const result=await runPrivateJournalCycle(local,remote.reader,writer,'alice',()=>authorized);
    expect(result).toMatchObject({status:'blocked',reason:'identity-changed'});
    expect((await local.read()).pending).toHaveLength(1);
  });

  it('conflicting offline edits on two devices are refused before the second device uploads',async()=>{
    const founder=repo(),deviceB=repo(),deviceC=repo(),remote=store();
    await founder.commit(plant('dragon'));
    await runPrivateJournalCycle(founder,remote.reader,remote.writer,'alice',()=>true);
    await hydratePrivateJournal(deviceB,remote.reader,'alice',()=>true);
    await hydratePrivateJournal(deviceC,remote.reader,'alice',()=>true);
    await deviceB.commit({type:'plant.patch',id:'dragon',patch:{notes:'B'}});
    await deviceC.commit({type:'plant.patch',id:'dragon',patch:{notes:'C'}});
    await runPrivateJournalCycle(deviceB,remote.reader,remote.writer,'alice',()=>true);
    const before=await deviceC.read();
    const n=remote.calls;
    await expect(runPrivateJournalCycle(deviceC,remote.reader,remote.writer,'alice',()=>true))
      .rejects.toMatchObject({reason:'conflicting-writes'});
    expect(remote.calls).toBe(n);
    expect(await deviceC.read()).toEqual(before);
  });

  it('distinguishes a genuinely empty journal from locally pending receipts already restored from server',async()=>{
    const local=repo(),remote=store();
    expect(await uploadPendingJournal(local,remote.writer,'alice',()=>true)).toEqual({status:'nothing-to-upload'});
    await local.commit(plant('pineapple'));
    const env=await local.read();
    await remote.writer.appendOnce(prepareCloudRecord('alice',env,env.pending[0]));
    await hydratePrivateJournal(local,remote.reader,'alice',()=>true);
    expect(await uploadPendingJournal(local,remote.writer,'alice',()=>true))
      .toEqual({status:'remote-receipts-already-present',count:1});
    expect(remote.calls).toBe(1);
  });
});
