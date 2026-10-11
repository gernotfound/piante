import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { LocalGardenRepository } from '../../src/storage/localRepository';
import { firestoreJournalPort } from '../../src/cloud/firestoreJournal';
import { firestoreJournalReader } from '../../src/cloud/firestoreReader';
import { firestoreCheckpointObservationPort } from '../../src/cloud/firestoreCheckpointObservation';
import { CheckpointObservationConflict, publishCheckpointObservation } from '../../src/cloud/checkpointObservation';

let env:RulesTestEnvironment;
const uuid='123e4567-e89b-42d3-a456-426614174000';
const uuid2='123e4567-e89b-42d3-a456-426614174001';
const path='piante_users/alice/checkpoint_observations/'+uuid;
const record=(count=0,hash='a'.repeat(64))=>({
  protocol:1,status:'observation-only',compactionAuthorized:false,
  ownerUid:'alice',replicaId:uuid,receiptCount:count,
  observedPrefixes:count?{[uuid]:count}:{},
  sha256:hash
}) as const;
const db=(uid?:string)=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
let num=0;

beforeAll(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore Emulator required');
  env=await initializeTestEnvironment({projectId:'demo-piante-test',firestore:{
    host:'127.0.0.1',port:8177
  }});
});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'piante_access/alice'),{enabled:true});
    await setDoc(doc(c.firestore(),'piante_access/bob'),{enabled:false});
  });
});
afterAll(async()=>{await env?.cleanup();});

describe('M5b-2 readback and Rules of advisory observations (CRITICAL)',()=>{
  it('persists an owner observation and retries identically; only increasing prefixes advance',async()=>{
    const port=firestoreCheckpointObservationPort(db('alice'));
    expect(await port.saveAndVerify(record())).toBe('created');
    expect(await port.saveAndVerify(record())).toBe('duplicate');
    expect(await port.saveAndVerify(record(1,'b'.repeat(64)))).toBe('advanced');
    expect((await getDoc(doc(db('alice'),path))).data()).toEqual(record(1,'b'.repeat(64)));
    await expect(port.saveAndVerify(record())).rejects.toBeInstanceOf(CheckpointObservationConflict);
    await expect(port.saveAndVerify(record(1,'c'.repeat(64))))
      .rejects.toBeInstanceOf(CheckpointObservationConflict);
    expect((await getDoc(doc(db('alice'),path))).data()?.sha256).toBe('b'.repeat(64));
  });

  it('denies identity spoofing, deletion and unsafe schema updates',async()=>{
    await assertSucceeds(setDoc(doc(db('alice'),path),record()));
    await assertFails(deleteDoc(doc(db('alice'),path)));
    await assertFails(updateDoc(doc(db('alice'),path),{compactionAuthorized:true}));
    await assertFails(updateDoc(doc(db('alice'),path),{status:'checkpoint-authoritative'}));
    await assertFails(updateDoc(doc(db('alice'),path),{receiptCount:0,sha256:'c'.repeat(64)}));
    await assertFails(updateDoc(doc(db('alice'),path),{extra:'field',receiptCount:1}));
    await assertFails(setDoc(doc(db('alice'),'piante_users/alice/checkpoint_observations/'+uuid2),record()));
    await assertFails(setDoc(doc(db('alice'),path),{...record(),ownerUid:'bob'}));
    await assertFails(setDoc(doc(db('alice'),path),{...record(),sha256:'invalid'}));
    await assertFails(setDoc(doc(db('alice'),path),{...record(),protocol:99}));
    await assertFails(setDoc(doc(db('alice'),path),{...record(),observedPrefixes:'not a map'}));
    await assertSucceeds(getDoc(doc(db('alice'),path)));
  });

  it('rejects anonymous/cross-account and revoked access, without impacting legacy paths',async()=>{
    await assertFails(setDoc(doc(db(),path),record()));
    await assertFails(setDoc(doc(db('bob'),path),record()));
    await assertFails(setDoc(doc(db('alice'),'piante_users/bob/checkpoint_observations/'+uuid),{
      ...record(),ownerUid:'bob'
    }));
    await setDoc(doc(db('alice'),path),record());
    await assertFails(getDoc(doc(db(),path)));
    await assertFails(getDoc(doc(db('bob'),path)));
    await env.withSecurityRulesDisabled(async c=>{
      await updateDoc(doc(c.firestore(),'piante_access/alice'),{enabled:false});
    });
    await assertFails(getDoc(doc(db('alice'),path)));
    await assertFails(updateDoc(doc(db('alice'),path),{receiptCount:1}));
  });

  it('records a real uploaded garden operation without mutating the journal',async()=>{
    const local=new LocalGardenRepository('user:alice',{dbName:'m5b2-emulator-'+(++num),now:()=>1000});
    await local.commit({type:'plant.create',plant:{
      id:'avocado',commonName:'Avocado',origin:'seed',status:'active'
    }});
    const firestore=db('alice');
    const envelope=await local.read();
    const journal=firestoreJournalPort(firestore);
    await journal.appendOnce({
      protocol:1,ownerUid:'alice',
      operationId:envelope.pending[0].operationId,replicaId:envelope.replicaId,
      sequence:1,appliedAt:1000,operation:envelope.pending[0].operation
    });
    const reader=firestoreJournalReader(firestore);
    const port=firestoreCheckpointObservationPort(firestore);
    const observed=await publishCheckpointObservation(local,reader,port,'alice',()=>true);
    expect(observed.status).toBe('server-observation-only');
    expect(observed.compactionAuthorized).toBe(false);
    expect(observed.outcome).toBe('created');
    expect((await getDoc(doc(firestore,
      'piante_users/alice/checkpoint_observations/'+envelope.replicaId))).data())
      .toEqual(observed.observation);
    expect((await local.read()).pending).toEqual(envelope.pending);
    expect(await reader.readAll('alice',200)).toHaveLength(1);
  });
});
