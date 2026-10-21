import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { firestoreObservationReader } from '../../src/cloud/firestoreObservationReader';
import { inspectObservationAudit } from '../../src/cloud/observationAudit';

let env:RulesTestEnvironment;
const a='123e4567-e89b-42d3-a456-426614174000';
const b='123e4567-e89b-42d3-a456-426614174001';
const record=(id:string,hash='a'.repeat(64))=>({
  protocol:1,status:'observation-only',compactionAuthorized:false,
  ownerUid:'alice',replicaId:id,receiptCount:1,observedPrefixes:{[a]:1},sha256:hash
});
beforeAll(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore Emulator required');
  env=await initializeTestEnvironment({projectId:'demo-piante-test',firestore:{host:'127.0.0.1',port:8177}});
});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'piante_access/alice'),{enabled:true});
    await setDoc(doc(c.firestore(),'piante_access/bob'),{enabled:true});
  });
});
afterAll(async()=>{await env?.cleanup();});
describe('M5b-3 server-only observation audit and real Emulator Rules',()=>{
  it('reads two real owner-scoped observations, sees discrepancies, and never mutates them',async()=>{
    const db=env.authenticatedContext('alice').firestore();
    await setDoc(doc(db,'piante_users/alice/checkpoint_observations/'+a),record(a));
    await setDoc(doc(db,'piante_users/alice/checkpoint_observations/'+b),record(b,'b'.repeat(64)));
    const reader=firestoreObservationReader(db);
    const before=(await getDocs(collection(db,'piante_users/alice/checkpoint_observations')))
      .docs.map(x=>({id:x.id,data:x.data()}));
    const result=await inspectObservationAudit(reader,'alice',()=>true);
    expect(result.replicaCount).toBe(2);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.compactionAuthorized).toBe(false);
    await expect(reader.readAll('alice',1)).rejects.toMatchObject({reason:'limit-exceeded'});
    const after=(await getDocs(collection(db,'piante_users/alice/checkpoint_observations')))
      .docs.map(x=>({id:x.id,data:x.data()}));
    expect(after).toEqual(before);
  });
  it('denies anonymous and cross-owner scans and refuses access after grant revocation',async()=>{
    const alice=env.authenticatedContext('alice').firestore();
    await setDoc(doc(alice,'piante_users/alice/checkpoint_observations/'+a),record(a));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(),
      'piante_users/alice/checkpoint_observations')));
    await assertFails(getDocs(collection(env.authenticatedContext('bob').firestore(),
      'piante_users/alice/checkpoint_observations')));
    await env.withSecurityRulesDisabled(async c=>{
      await setDoc(doc(c.firestore(),'piante_access/alice'),{enabled:false});
    });
    await expect(firestoreObservationReader(alice).readAll('alice',200)).rejects.toBeDefined();
  });
});
