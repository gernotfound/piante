import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalGardenRepository } from '../storage/localRepository';
import { PrivateGarden } from './PrivateGarden';

let seq=0;
const local=(ownerScope='user:alice') => new LocalGardenRepository(ownerScope,{
  dbName:'piante-m3a-private-'+(++seq),now:()=>1000
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('M3a gated private botanical archive (local-only)',()=>{
  it('shows no data before its IndexedDB read, then saves a plant, place and diary only after durable commit',async()=>{
    const repo=local();
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Nessuna pianta nell\'archivio locale. Aggiungi il primo esemplare.')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Nome comune *'),{target:{value:'Avocado Bacon'}});
    fireEvent.change(screen.getByLabelText('Nome scientifico'),{target:{value:'Persea americana'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva pianta'}));
    expect(await screen.findByText('Avocado Bacon')).toBeDefined();
    expect(await screen.findByText('Persea americana')).toBeDefined();
    expect((await repo.read()).pending).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Luogo'}));
    fireEvent.change(screen.getByLabelText('Nome luogo *'),{target:{value:'Balcone'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva luogo'}));
    await waitFor(async()=>expect(Object.keys((await repo.read()).data.places)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button',{name:'Diario'}));
    const p=Object.values((await repo.read()).data.plants)[0];
    fireEvent.change(screen.getByLabelText('Pianta *'),{target:{value:p.id}});
    fireEvent.change(screen.getByLabelText('Note (private)'),{target:{value:'Prima osservazione'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva nel diario'}));
    expect(await screen.findByText(/Prima osservazione/)).toBeDefined();
    expect((await repo.read()).pending).toHaveLength(3);
    expect(Object.keys((await repo.read()).data.events)).toHaveLength(1);
    expect(screen.getByRole('button',{name:'Esporta backup JSON'})).toBeDefined();
    expect(screen.getByText(/backup JSON non sono cifrati/)).toBeDefined();
  });

  it('keeps owner-specific archives isolated even in the same browser database',async()=>{
    const name='piante-m3a-shared-'+(++seq);
    const alice=new LocalGardenRepository('user:alice',{dbName:name,now:()=>1});
    const bob=new LocalGardenRepository('user:bob',{dbName:name,now:()=>1});
    await alice.commit({type:'plant.create',plant:{id:'dragonfruit',commonName:'Dragon fruit',origin:'cutting',status:'active'}});
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={alice} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Dragon fruit')).toBeDefined();
    unmount();
    render(<PrivateGarden ownerScope="user:bob" repository={bob} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Nessuna pianta nell\'archivio locale. Aggiungi il primo esemplare.')).toBeDefined();
    expect(screen.queryByText('Dragon fruit')).toBeNull();
  });

  it('does not report a success or expose optimistic data when a durable write fails',async()=>{
    const repo=local();
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    await screen.findByText('Nessuna pianta nell\'archivio locale. Aggiungi il primo esemplare.');
    vi.spyOn(repo,'commit').mockRejectedValueOnce(new Error('IndexedDB quota exceeded'));
    fireEvent.change(screen.getByLabelText('Nome comune *'),{target:{value:'Feijoa'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva pianta'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent','IndexedDB quota exceeded');
    expect(screen.queryByText('Pianta salvata')).toBeNull();
    expect(Object.keys((await repo.read()).data.plants)).toHaveLength(0);
  });
  it('preserves all data after a local reload and records status edits as journal operations',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{id:'guava',commonName:'Guava rossa',origin:'purchased',status:'active'}});
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Guava rossa')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Stato'),{target:{value:'archived'}});
    await waitFor(async()=>expect((await repo.read()).data.plants.guava.status).toBe('archived'));
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Guava rossa')).toBeDefined();
    expect((await repo.read()).pending).toHaveLength(2);
    expect((screen.getByLabelText('Stato') as HTMLSelectElement).value).toBe('archived');
  });
});
