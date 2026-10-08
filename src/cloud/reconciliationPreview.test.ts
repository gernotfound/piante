import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import {
  buildReconciliationPreview, inspectRemoteJournal, ReconciliationBlocked,
  type CloudJournalReader
} from './reconciliationPreview';
import {
  cloudJournalRecordSchema, prepareCloudRecord, type CloudJournalRecord
} from './journal';

const actor1 = '123e4567-e89b-42d3-a456-426614174000';
const actor2 = '123e4567-e89b-42d3-a456-426614174001';
let counter = 0;
const local = () => new LocalGardenRepository('user:alice', {
  dbName: 'm2c-preview-' + (++counter), now: () => 1000
});
const plant = (id: string) => ({
  type: 'plant.create', plant: { id, commonName: id, origin: 'seed', status: 'active' }
}) as const;
const cloud = (
  replicaId: string, sequence: number,
  operation: CloudJournalRecord['operation'],
  appliedAt = 1000
): CloudJournalRecord => cloudJournalRecordSchema.parse({
  protocol: 1, ownerUid: 'alice', operationId: replicaId + ':' + sequence,
  replicaId, sequence, appliedAt, operation
});
const wrapped = (...rows: CloudJournalRecord[]) =>
  rows.map(row => ({id: row.operationId, data: row}));
const blocked = (f: () => unknown, reason: string) => {
  try { f(); throw new Error('Expected reconciliation to be blocked'); }
  catch (e) {
    if (e instanceof ReconciliationBlocked) expect(e.reason).toBe(reason);
    else throw e;
  }
};
describe('M2c safe full-scan reconciliation preview (CRITICAL)', () => {
  it('merges independent device operations deterministically without touching IndexedDB', async () => {
    const repo = local();
    await repo.commit(plant('white_dragon'));
    const before = await repo.read();
    const other = cloud(actor1, 1, plant('red_dragon'), 500);
    const reader: CloudJournalReader = {readAll: async () => wrapped(other)};
    const preview = await inspectRemoteJournal(repo, reader, 'alice', () => true);
    expect(preview.status).toBe('preview-only');
    expect(preview.data.plants.red_dragon).toBeDefined();
    expect(preview.data.plants.white_dragon).toBeDefined();
    expect(preview.operationCount).toBe(2);
    expect(await repo.read()).toEqual(before);
  });

  it('deduplicates a local operation already uploaded to Firestore', async () => {
    const repo = local(); await repo.commit(plant('avocado'));
    const envelope = await repo.read();
    const receipt = prepareCloudRecord('alice', envelope, envelope.pending[0]);
    const preview = buildReconciliationPreview('alice', wrapped(receipt), envelope);
    expect(preview.operationCount).toBe(1);
    expect(Object.keys(preview.data.plants)).toEqual(['avocado']);
    expect(preview.locallyPendingCount).toBe(1);
  });

  it('handles own replica order and missing cross-replica dependencies', async () => {
    const repo = local();
    const envelope = await repo.read();
    const createPlace = cloud(actor2, 1, {
      type: 'place.create', place: {id: 'balcony', name: 'Balcone', kind: 'balcony'}
    }, 5000);
    const createPlant = cloud(actor1, 1, plant('seedling'), 1);
    const updatePlant = cloud(actor1, 2, {
      type: 'plant.patch', id: 'seedling', patch: {placeId: 'balcony'}
    }, 2);
    const e = buildReconciliationPreview('alice', wrapped(updatePlant, createPlace, createPlant), envelope);
    expect(e.data.plants.seedling.placeId).toBe('balcony');
    expect(buildReconciliationPreview('alice', wrapped(createPlace, createPlant, updatePlant), envelope).data).toEqual(e.data);
  });

  it('does not silently accept incomplete sequences', async () => {
    const envelope = await local().read();
    blocked(() => buildReconciliationPreview('alice', wrapped(cloud(actor1, 2, plant('x'))), envelope), 'history-gap');
    blocked(() => buildReconciliationPreview('alice', wrapped(cloud(actor1, 1, plant('x'))), {
      ...envelope, lastSequence: 1, revision: 1, pending: []
    }), 'local-divergence');
  });

  it('blocks concurrent field overwrite and duplicated entity creation', async () => {
    const envelope = await local().read();
    const create = cloud(actor1, 1, plant('same'));
    const p1 = cloud(actor1, 2, {type: 'plant.patch', id: 'same', patch: {notes: 'first'}});
    const p2 = cloud(actor2, 1, {type: 'plant.patch', id: 'same', patch: {notes: 'second'}});
    blocked(() => buildReconciliationPreview('alice', wrapped(create, p1, p2), envelope), 'conflicting-writes');
    blocked(() => buildReconciliationPreview('alice', wrapped(create, cloud(actor2, 1, plant('same'))), envelope), 'conflicting-writes');
    blocked(() => buildReconciliationPreview('alice', wrapped(cloud(actor1, 1, {
      type: 'plant.patch', id: 'missing', patch: {notes: 'bad'}
    })), envelope), 'unresolvable-history');
  });

  it('blocks forged, incompatible and identity-colliding receipts', async () => {
    const envelope = await local().read();
    const row = cloud(actor1, 1, plant('a'));
    blocked(() => buildReconciliationPreview('alice', [{id:'wrong',data:row}], envelope), 'invalid-receipt');
    blocked(() => buildReconciliationPreview('alice', [{id:row.operationId,data:{...row,ownerUid:'bob'}}], envelope), 'invalid-receipt');
    blocked(() => buildReconciliationPreview('alice', [{id:row.operationId,data:{...row,protocol:99}}], envelope), 'invalid-receipt');
    blocked(() => buildReconciliationPreview('alice', [
      ...wrapped(row),{id:row.operationId,data:{...row,appliedAt:1}}
    ], envelope), 'invalid-receipt');
    blocked(() => buildReconciliationPreview('bob',wrapped(row),envelope), 'identity-changed');
  });

  it('rejects corrupted local snapshots and refuses truncated remote scans', async () => {
    const repo = local();
    await repo.commit(plant('a'));
    const envelope = await repo.read();
    blocked(() => buildReconciliationPreview('alice', [], {
      ...envelope, data: {plants:{},events:{},places:{}}
    }), 'local-divergence');
    blocked(() => buildReconciliationPreview('alice', wrapped(cloud(actor1, 1, plant('x'))), envelope, 1), 'limit-exceeded');
  });

  it('does not accept a cloud result after logout', async () => {
    const repo = local();
    let authorized = true;
    const reader: CloudJournalReader = {readAll: async () => {
      authorized = false;
      return [];
    }};
    await expect(inspectRemoteJournal(repo, reader, 'alice', () => authorized))
      .rejects.toMatchObject({reason:'identity-changed'});
  });

  it('detects a local edit during the cloud read and does not persist the preview', async () => {
    const repo = local();
    const reader: CloudJournalReader = {readAll: async () => {
      await repo.commit(plant('new'));
      return [];
    }};
    await expect(inspectRemoteJournal(repo, reader, 'alice', () => true))
      .rejects.toMatchObject({reason:'concurrent-local-change'});
    expect((await repo.read()).data.plants.new).toBeDefined();
  });

  it('preserves typed limit errors raised by the server reader', async () => {
    const repo = local();
    const reader: CloudJournalReader = {readAll: async () => {
      throw new ReconciliationBlocked('limit-exceeded');
    }};
    await expect(inspectRemoteJournal(repo, reader, 'alice', () => true))
      .rejects.toMatchObject({reason:'limit-exceeded'});
  });

  it('never treats remote failure as an empty cloud', async () => {
    const repo = local();
    const reader: CloudJournalReader = {readAll: async () => {throw new Error('offline');}};
    await expect(inspectRemoteJournal(repo, reader, 'alice', () => true))
      .rejects.toMatchObject({reason:'remote-unavailable'});
  });
});
