import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import { prepareCloudRecord, uploadPendingJournal, type CloudJournalPort } from './journal';

let id = 0;
const repo = (uid = 'alice') => new LocalGardenRepository(`user:${uid}`, { dbName: 'piante-m2b-'+(++id), now: () => 99 });
const operation = (plant: string) => ({
  type: 'plant.create', plant: { id: plant, commonName: 'Dragon fruit', origin: 'cutting', status: 'active' }
});
const allowed = () => true;

describe('M2b durable append-only journal transport (CRITICAL)', () => {
  it('persists and retries the exact stable record without removing local pending data', async () => {
    const local = repo();
    await local.commit(operation('dragon1'));
    const recorded: string[] = [];
    const port: CloudJournalPort = { appendOnce: async record => {
      recorded.push(JSON.stringify(record)); return recorded.length === 1 ? 'created' : 'duplicate';
    } };
    expect(await uploadPendingJournal(local, port, 'alice', allowed)).toEqual({
      status: 'uploaded-awaiting-reconciliation', count: 1
    });
    expect(await uploadPendingJournal(local, port, 'alice', allowed)).toEqual({
      status: 'uploaded-awaiting-reconciliation', count: 1
    });
    expect(recorded[0]).toEqual(recorded[1]);
    expect((await local.read()).pending).toHaveLength(1);
  });

  it('rejects attempts to upload a different account’s data', async () => {
    const local = repo('alice');
    await local.commit(operation('a'));
    let calls = 0;
    const port: CloudJournalPort = { appendOnce: async () => { calls++; return 'created'; } };
    expect(await uploadPendingJournal(local, port, 'bob', allowed)).toEqual({
      status: 'failed', count: 0, reason: 'identity-changed'
    });
    expect(calls).toBe(0);
    const state = await local.read();
    expect(() => prepareCloudRecord('bob', state, state.pending[0])).toThrow();
  });

  it('keeps journal durable after an ambiguous remote commit or timeout', async () => {
    const local = repo();
    await local.commit(operation('a'));
    let remoteApplied = false;
    const port: CloudJournalPort = { appendOnce: async () => {
      remoteApplied = true;
      throw new Error('unconfirmed network timeout');
    } };
    expect(await uploadPendingJournal(local, port, 'alice', allowed)).toEqual({
      status: 'local-pending', count: 0
    });
    expect(remoteApplied).toBe(true);
    expect((await local.read()).pending).toHaveLength(1);
  });

  it('does not mistake permission denied for a successful upload', async () => {
    const local = repo(); await local.commit(operation('a'));
    const port: CloudJournalPort = { appendOnce: async () => { throw {code:'permission-denied'}; } };
    expect(await uploadPendingJournal(local, port, 'alice', allowed)).toEqual({
      status: 'rejected', count: 0
    });
    expect((await local.read()).pending).toHaveLength(1);
  });

  it('invalidates an auth session change before the next entry', async () => {
    const local = repo(); await local.commit(operation('a')); await local.commit(operation('b'));
    let authorized = true;
    const port: CloudJournalPort = { appendOnce: async () => { authorized = false; return 'created'; } };
    expect(await uploadPendingJournal(local, port, 'alice', () => authorized)).toEqual({
      status: 'failed', count: 1, reason: 'identity-changed'
    });
    expect((await local.read()).pending).toHaveLength(2);
  });

  it('never returns a safe pending outcome when the journal changed after ambiguous transport', async () => {
    const local = repo(); await local.commit(operation('a'));
    const port: CloudJournalPort = { appendOnce: async () => {
      await local.acknowledgeThrough(1);
      throw new Error('timeout');
    } };
    expect(await uploadPendingJournal(local, port, 'alice', allowed)).toEqual({
      status: 'failed', count: 0, reason: 'local-invariant'
    });
  });

  it('rejects unknown schema and invalid operation IDs', async () => {
    const local = repo(); await local.commit(operation('a'));
    const original = await local.read();
    expect(() => prepareCloudRecord('bob', original, original.pending[0])).toThrow();
    expect(() => prepareCloudRecord('alice', original, {...original.pending[0],operationId:'forged'})).toThrow();
  });
});
