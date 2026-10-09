import 'fake-indexeddb/auto';
import {webcrypto} from 'node:crypto';
import {IDBObjectStore} from 'fake-indexeddb';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {LocalGardenRepository} from '../storage/localRepository';
import {hydratePrivateJournal} from '../cloud/hydration';
import {uploadPendingJournal,type CloudJournalPort} from '../cloud/journal';
import {createLocalBackup,inspectLocalBackup,restoreLocalBackup,MAX_BACKUP_BYTES} from './localBackup';

let number=0;
const repo=(owner='user:alice')=>new LocalGardenRepository(owner,{dbName:'backup-m3b-'+(++number),now:()=>1000});
const authorized=()=>true;
async function example(){
 const r=repo();
 await r.commit({type:'plant.create',plant:{id:'guava',commonName:'Guava rossa',origin:'seed',status:'active',notes:'riservato',purchasePrice:42}});
 await r.commit({type:'event.add',event:{id:'flower',plantId:'guava',date:'2026-10-09',type:'flowering'}});
 return r;
}
beforeEach(()=>vi.stubGlobal('crypto',{subtle:webcrypto.subtle,randomUUID:webcrypto.randomUUID.bind(webcrypto)}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('M3b offline backup and recovery (CRITICAL)',()=>{
 it('exports every operation and restores atomically to an empty archive, then remains editable',async()=>{
  const source=await example();
  const original=await source.read();
  const file=await createLocalBackup(source,'user:alice',authorized);
  expect(file).toContain('riservato');
  expect(await inspectLocalBackup(file,'user:alice',authorized)).toMatchObject({plants:1,events:1,pending:2});
  const target=repo();
  const restored=await restoreLocalBackup(target,file,'user:alice',authorized);
  expect(restored.backupQuarantined).toBe(true);
  expect(restored.data).toEqual(original.data);
  expect(restored.pending).toEqual(original.pending);
  expect((await target.read()).data).toEqual(original.data);
  await target.commit({type:'plant.patch',id:'guava',patch:{status:'archived'}});
  expect((await target.read()).pending).toHaveLength(3);
 });
 it('never sends restored replica identities to Firestore',async()=>{
  const backup=await createLocalBackup(await example(),'user:alice',authorized);
  const restored=repo();await restoreLocalBackup(restored,backup,'user:alice',authorized);
  const port:CloudJournalPort={appendOnce:vi.fn(async()=> 'created' as const)};
  expect(await uploadPendingJournal(restored,port,'alice',authorized)).toMatchObject({status:'failed',reason:'local-invariant'});
  expect(port.appendOnce).not.toHaveBeenCalled();
  const readAll=vi.fn(async()=>[]);
  await expect(hydratePrivateJournal(restored,{readAll},'alice',authorized)).rejects.toMatchObject({reason:'local-divergence'});
  expect(readAll).not.toHaveBeenCalled();
 });
 it('rejects foreign owners and refuses to overwrite existing data',async()=>{
  const backup=await createLocalBackup(await example(),'user:alice',authorized);
  const other=repo('user:bob');
  await expect(restoreLocalBackup(other,backup,'user:bob',authorized)).rejects.toThrow('differente');
  const target=repo();
  await target.commit({type:'plant.create',plant:{id:'owned',commonName:'Originale',origin:'seed',status:'active'}});
  const before=await target.read();
  await expect(restoreLocalBackup(target,backup,'user:alice',authorized)).rejects.toThrow('vuoto');
  expect(await target.read()).toEqual(before);
 });
 it('rejects corrupt, future, extra-key and oversized files without any writes',async()=>{
  const backup=await createLocalBackup(await example(),'user:alice',authorized);
  await expect(inspectLocalBackup(backup.replace('Guava rossa','Guava gialla'),'user:alice',authorized)).rejects.toThrow('SHA-256');
  await expect(inspectLocalBackup(backup.slice(0,23),'user:alice',authorized)).rejects.toThrow('JSON');
  const future=JSON.parse(backup) as Record<string,unknown>;future.formatVersion=2;
  await expect(inspectLocalBackup(JSON.stringify(future),'user:alice',authorized)).rejects.toThrow('Formato');
  await expect(inspectLocalBackup(' '.repeat(MAX_BACKUP_BYTES+1),'user:alice',authorized)).rejects.toThrow('32 MiB');
 });
 it('rolls back a failed storage transaction and a revoked session',async()=>{
  const backup=await createLocalBackup(await example(),'user:alice',authorized);
  const target=repo(),before=await target.read();
  const spy=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementationOnce(()=>{throw Error('storage unavailable');});
  await expect(restoreLocalBackup(target,backup,'user:alice',authorized)).rejects.toThrow('storage unavailable');
  spy.mockRestore();expect(await target.read()).toEqual(before);
  let checks=0;
  await expect(restoreLocalBackup(target,backup,'user:alice',()=>++checks<3)).rejects.toThrow();
  expect(await target.read()).toEqual(before);
 });
});
