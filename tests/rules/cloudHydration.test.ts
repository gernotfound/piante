import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { LocalGardenRepository } from '../../src/storage/localRepository';
import { firestoreJournalPort } from '../../src/cloud/firestoreJournal';
import { firestoreJournalReader } from '../../src/cloud/firestoreReader';
import { hydratePrivateJournal } from '../../src/cloud/hydration';
import { uploadPendingJournal } from '../../src/cloud/journal';

let env:RulesTestEnvironment;
let counter=0;
const instance=()=>new LocalGardenRepository('user:alice',{
  dbName:'m2d-emulator-'+(++counter),now:()=>1000
});
const plant=(id:string)=>({type:'plant.create',plant:{
  id,commonName:id,origin:'seed',status:'active'
}}) as const;
const db=()=>env.authenticatedContext('alice').firestore();

beforeAll(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Emulator required');
  env=await initializeTestEnvironment({projectId:'demo-piante-test',firestore:{
    host:'127.0.0.1',port:8177
  }});
});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:true});
  });
});
afterAll(async()=>{await env?.cleanup();});

describe('M2d persisted two-device sync in Firestore Emulator (CRITICAL)',()=>{
  it('uploads, recovers a second device, edits offline and converges without acking local journal',async()=>{
    const a=instance(),b=instance();
    await a.commit(plant('bacon'));
    const client=db();
    const writer=firestoreJournalPort(client);
    const reader=firestoreJournalReader(client);
    expect(await uploadPendingJournal(a,writer,'alice',()=>true))
      .toEqual({status:'uploaded-awaiting-reconciliation',count:1});
    const first=await hydratePrivateJournal(b,reader,'alice',()=>true);
    expect(first.remoteCount).toBe(1);
    expect((await b.read()).data.plants.bacon).toBeDefined();
    await b.commit({type:'event.add',event:{
      id:'first_flower',plantId:'bacon',date:'2026-10-08',type:'flowering'
    }});
    expect(await uploadPendingJournal(b,writer,'alice',()=>true))
      .toEqual({status:'uploaded-awaiting-reconciliation',count:1});
    const second=await hydratePrivateJournal(a,reader,'alice',()=>true);
    expect(second.remoteCount).toBe(2);
    await hydratePrivateJournal(b,reader,'alice',()=>true);
    expect((await a.read()).data).toEqual((await b.read()).data);
    expect((await a.read()).pending).toHaveLength(1);
    expect((await b.read()).pending).toHaveLength(1);
  });

  it('retains the on-device snapshot when security rules revoke its grant',async()=>{
    const client=db(), writer=firestoreJournalPort(client);
    const a=instance(),b=instance();
    await a.commit(plant('guava'));
    await uploadPendingJournal(a,writer,'alice',()=>true);
    const reader=firestoreJournalReader(client);
    await hydratePrivateJournal(b,reader,'alice',()=>true);
    const saved=await b.read();
    await env.withSecurityRulesDisabled(async ctx=>{
      await updateDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:false});
    });
    await expect(hydratePrivateJournal(b,reader,'alice',()=>true))
      .rejects.toMatchObject({reason:'remote-unavailable'});
    expect(await b.read()).toEqual(saved);
  });

  it('stops rather than downloading forged data from the server',async()=>{
    const b=instance();
    await env.withSecurityRulesDisabled(async ctx=>{
      await setDoc(doc(ctx.firestore(),'piante_users/alice/operations/forged'),{
        protocol:99,ownerUid:'alice',operationId:'forged',sequence:1
      });
    });
    const before=await b.read();
    await expect(hydratePrivateJournal(b,firestoreJournalReader(db()),'alice',()=>true))
      .rejects.toMatchObject({reason:'invalid-receipt'});
    expect(await b.read()).toEqual(before);
  });
});
