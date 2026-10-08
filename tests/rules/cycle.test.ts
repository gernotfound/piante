import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { LocalGardenRepository } from '../../src/storage/localRepository';
import { firestoreJournalPort } from '../../src/cloud/firestoreJournal';
import { firestoreJournalReader } from '../../src/cloud/firestoreReader';
import { runPrivateJournalCycle } from '../../src/cloud/cycle';

let env:RulesTestEnvironment;
let index=0;
beforeAll(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Emulator required');
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

describe('M2e real Firestore Emulator batching (CRITICAL)',()=>{
  it('uploads >20 durable intents, persists every cloud confirmation, and avoids repeat writes',async()=>{
    const local=new LocalGardenRepository('user:alice',{
      dbName:'m2e-emulator-'+(++index),now:()=>1000
    });
    for(let i=0;i<23;i++){
      await local.commit({type:'plant.create',plant:{
        id:'plant_'+i,commonName:'Plant '+i,origin:'seed',status:'active'
      }});
    }
    const db=env.authenticatedContext('alice').firestore();
    const reader=firestoreJournalReader(db),writer=firestoreJournalPort(db);
    const result=await runPrivateJournalCycle(local,reader,writer,'alice',()=>true);
    expect(result).toEqual({
      status:'verified-receipts-journal-retained',uploadedInCycle:23,
      remoteCount:23,localPendingCount:23
    });
    const server=await reader.readAll('alice',200);
    expect(server).toHaveLength(23);
    expect((await local.read()).remoteReceipts).toHaveLength(23);
    expect(await runPrivateJournalCycle(local,reader,writer,'alice',()=>true))
      .toMatchObject({status:'verified-receipts-journal-retained',uploadedInCycle:0});
    expect((await local.read()).pending).toHaveLength(23);
  });
});
