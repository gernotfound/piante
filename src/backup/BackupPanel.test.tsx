import 'fake-indexeddb/auto';
import {webcrypto} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {LocalGardenRepository} from '../storage/localRepository';
import {createLocalBackup} from './localBackup';
import {BackupPanel} from './BackupPanel';

let number=0;
const database=()=>new LocalGardenRepository('user:alice',{dbName:'m3b-ui-'+(++number),now:()=>500});
beforeEach(()=>vi.stubGlobal('crypto',{subtle:webcrypto.subtle,randomUUID:webcrypto.randomUUID.bind(webcrypto)}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('M3b manual backup UX (CRITICAL)',()=>{
 it('shows clear privacy warnings and starts an explicit download only on click',async()=>{
  const repo=database();
  await repo.commit({type:'plant.create',plant:{id:'avocado',commonName:'Avocado',origin:'seed',status:'active'}});
  const create=vi.fn(()=> 'blob:piante-test');
  const revoke=vi.fn();
  vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke});
  render(<BackupPanel ownerScope="user:alice" repository={repo}
    isStillAuthorized={()=>true} onRestored={vi.fn()}/>);
  expect(screen.getByText(/in chiaro/)).toBeDefined();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Esporta backup JSON'}));
  await waitFor(()=>expect(create).toHaveBeenCalledOnce());
  expect(await screen.findByText(/Download avviato/)).toBeDefined();
 });
 it('shows a validated preview and never writes before a separate explicit confirmation',async()=>{
  const original=database();
  await original.commit({type:'plant.create',plant:{id:'guava',commonName:'Guava',origin:'seed',status:'active'}});
  const json=await createLocalBackup(original,'user:alice',()=>true);
  const target=database(),saved=vi.fn();
  render(<BackupPanel ownerScope="user:alice" repository={target}
    isStillAuthorized={()=>true} onRestored={saved}/>);
  const file=new File([json],'backup.json',{type:'application/json'});
  Object.defineProperty(file,'text',{value:async()=>json});
  fireEvent.change(screen.getByLabelText('Seleziona backup JSON'),{target:{files:[file]}});
  expect(await screen.findByText(/Backup verificato/)).toBeDefined();
  expect((await target.read()).data.plants.guava).toBeUndefined();
  fireEvent.click(screen.getByRole('button',{name:/Conferma ripristino/}));
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  expect((await target.read()).data.plants.guava.commonName).toBe('Guava');
  expect((await target.read()).backupQuarantined).toBe(true);
 });
 it('never shows the import preview when the session is revoked during async file reading',async()=>{
  const repo=database();
  const json=await createLocalBackup(repo,'user:alice',()=>true);
  let active=true;
  render(<BackupPanel ownerScope="user:alice" repository={repo}
    isStillAuthorized={()=>active} onRestored={vi.fn()}/>);
  const file=new File([json],'backup.json',{type:'application/json'});
  Object.defineProperty(file,'text',{value:async()=>{active=false;return json;}});
  fireEvent.change(screen.getByLabelText('Seleziona backup JSON'),{target:{files:[file]}});
  await waitFor(()=>expect(screen.queryByText(/Backup verificato/)).toBeNull());
  expect((await repo.read()).backupQuarantined).toBe(false);
 });
});
