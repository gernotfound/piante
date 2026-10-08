import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment, type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { firestoreJournalReader } from '../../src/cloud/firestoreReader';
import { buildReconciliationPreview, ReconciliationBlocked } from '../../src/cloud/reconciliationPreview';
import { cloudJournalRecordSchema } from '../../src/cloud/journal';
import { LocalGardenRepository } from '../../src/storage/localRepository';

let env: RulesTestEnvironment;
const uuid = '123e4567-e89b-42d3-a456-426614174000';
const record = (sequence: number) => cloudJournalRecordSchema.parse({
  protocol: 1, ownerUid: 'alice', replicaId: uuid,
  operationId: uuid + ':' + sequence, sequence, appliedAt: sequence * 100,
  operation: {type:'plant.create',plant:{
    id: 'plant_' + sequence, commonName:'Avocado',origin:'seed',status:'active'
  }}
});
const owner = () => env.authenticatedContext('alice').firestore();

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Emulator required');
  env = await initializeTestEnvironment({projectId:'demo-piante-test', firestore:{host:'127.0.0.1',port:8177}});
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'piante_access/alice'),{enabled:true});
    await setDoc(doc(c.firestore(),'piante_access/bob'),{enabled:false});
  });
});
afterAll(async()=>{await env?.cleanup();});

describe('M2c server-sourced complete owner journal scan (Emulator)',()=>{
  it('reads only owner-scoped receipts and builds a validated preview',async()=>{
    const db=owner();
    const r=record(1);
    await setDoc(doc(db,'piante_users/alice/operations/'+r.operationId),r);
    const server=await firestoreJournalReader(db).readAll('alice',200);
    expect(server).toHaveLength(1);
    const local=new LocalGardenRepository('user:alice',{dbName:'m2c-rules-empty-1'});
    const view=buildReconciliationPreview('alice',server,await local.read());
    expect(view.data.plants.plant_1.commonName).toBe('Avocado');
  });
  it('rejects scans that exceed the cap rather than returning a partial cloud snapshot',async()=>{
    const db=owner();
    for (const seq of [1,2]) {
      const row=record(seq);
      await setDoc(doc(db,'piante_users/alice/operations/'+row.operationId),row);
    }
    await expect(firestoreJournalReader(db).readAll('alice',1))
      .rejects.toMatchObject({reason:'limit-exceeded'});
  });
  it('denies anonymous and non-owner reads of the entire journal',async()=>{
    await expect(firestoreJournalReader(env.unauthenticatedContext().firestore()).readAll('alice',200)).rejects.toBeDefined();
    await expect(firestoreJournalReader(env.authenticatedContext('bob').firestore()).readAll('alice',200)).rejects.toBeDefined();
  });
  it('denies server reads after revocation',async()=>{
    const db=owner();
    const row=record(1);
    await setDoc(doc(db,'piante_users/alice/operations/'+row.operationId),row);
    expect(await firestoreJournalReader(db).readAll('alice',200)).toHaveLength(1);
    await env.withSecurityRulesDisabled(async c=>{
      await updateDoc(doc(c.firestore(),'piante_access/alice'),{enabled:false});
    });
    await expect(firestoreJournalReader(db).readAll('alice',200)).rejects.toBeDefined();
  });
  it('rejects invalid account IDs and scan limits before querying Firestore',async()=>{
    const reader=firestoreJournalReader(owner());
    await expect(reader.readAll('foo/bar',200)).rejects.toBeInstanceOf(ReconciliationBlocked);
    await expect(reader.readAll('alice',201)).rejects.toMatchObject({reason:'limit-exceeded'});
  });
});
