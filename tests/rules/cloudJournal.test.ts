import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { firestoreJournalPort } from '../../src/cloud/firestoreJournal';
import { cloudJournalRecordSchema } from '../../src/cloud/journal';

let env: RulesTestEnvironment;
const replicaId = '123e4567-e89b-42d3-a456-426614174000';
const opId = replicaId + ':1';
const path = (uid: string, id = opId) => `piante_users/${uid}/operations/${id}`;
const operation = { type: 'plant.create', plant: { id: 'dragon1', commonName: 'Dragon fruit', origin: 'cutting', status: 'active' } } as const;
const record = (uid = 'alice') => cloudJournalRecordSchema.parse({
  protocol: 1, ownerUid: uid, operationId: opId, replicaId, sequence: 1, appliedAt: 100, operation
});
const db = (uid?: string) => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore Emulator required');
  env = await initializeTestEnvironment({ projectId: 'demo-piante-test', firestore: { host: '127.0.0.1', port: 8177 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'piante_access/alice'), { enabled: true });
    await setDoc(doc(ctx.firestore(), 'piante_access/bob'), { enabled: false });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe('M2b Firestore journal Rules and idempotent transport (Emulator)', () => {
  it('supports exactly-once logical append with transaction duplicate recovery', async () => {
    const port = firestoreJournalPort(db('alice'));
    expect(await port.appendOnce(record())).toBe('created');
    expect(await port.appendOnce(record())).toBe('duplicate');
    const saved = await assertSucceeds(getDoc(doc(db('alice'), path('alice'))));
    expect(saved.data()).toEqual(record());
  });
  it('rejects collision with same operationId but different data', async () => {
    const port = firestoreJournalPort(db('alice'));
    await port.appendOnce(record());
    await expect(port.appendOnce({ ...record(), appliedAt: 101 })).rejects.toThrow('Collisione');
  });
  it('denies anonymous, disabled and cross-owner reads and writes', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), path('alice')), record()));
    await assertFails(getDoc(doc(db(), path('alice'))));
    await assertFails(getDoc(doc(db('bob'), path('alice'))));
    await assertFails(setDoc(doc(db('bob'), path('alice', replicaId + ':2')), { ...record(), operationId: replicaId + ':2', sequence: 2 }));
    await assertFails(setDoc(doc(db('bob'), path('bob')), record('bob')));
    await assertFails(getDocs(collection(db('bob'), 'piante_users/alice/operations')));
  });
  it('rejects unauthorized changes to immutable operation receipts', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), path('alice')), record()));
    await assertFails(updateDoc(doc(db('alice'), path('alice')), { appliedAt: 101 }));
    await assertFails(deleteDoc(doc(db('alice'), path('alice'))));
    await assertFails(setDoc(doc(db('alice'), path('alice')), record()));
  });
  it('rejects unknown data, forged owners, invalid payload, and identity mismatches', async () => {
    const a = db('alice');
    await assertFails(setDoc(doc(a, path('alice')), { ...record(), malicious: 'private leak' }));
    await assertFails(setDoc(doc(a, path('alice')), { ...record(), ownerUid: 'bob' }));
    await assertFails(setDoc(doc(a, path('alice')), { ...record(), operation: { type: 'plant.create', plant: { ...operation.plant, untrusted: true } } }));
    await assertFails(setDoc(doc(a, path('alice')), { ...record(), operationId: 'different' }));
    await assertFails(setDoc(doc(a, path('alice')), { ...record(), protocol: 99 }));
  });
  it('revokes cloud access without relying on a stale browser state', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), path('alice')), record()));
    await env.withSecurityRulesDisabled(async ctx => {
      await updateDoc(doc(ctx.firestore(), 'piante_access/alice'), { enabled: false });
    });
    await assertFails(getDoc(doc(db('alice'), path('alice'))));
    await assertFails(setDoc(doc(db('alice'), path('alice', replicaId + ':2')), {
      ...record(), operationId: replicaId + ':2', sequence: 2
    }));
  });
});
