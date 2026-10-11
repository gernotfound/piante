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

  it('edits cultivar, pot, minimum temperature, location and notes durably across reloads',async()=>{
    const repo=local();
    await repo.commit({type:'place.create',place:{id:'balcony',name:'Balcone',kind:'balcony'}});
    await repo.commit({type:'plant.create',plant:{
      id:'feijoa',commonName:'Feijoa',origin:'purchased',status:'active'
    }});
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Feijoa')).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica Feijoa'}));
    fireEvent.change(screen.getByLabelText('Nome dell’esemplare *'),{target:{value:'Feijoa Apollo'}});
    fireEvent.change(screen.getByLabelText('Cultivar'),{target:{value:'Apollo'}});
    fireEvent.change(screen.getByLabelText('Capacità vaso (litri)'),{target:{value:'50'}});
    fireEvent.change(screen.getByLabelText('Temperatura minima (°C)'),{target:{value:'-5'}});
    fireEvent.change(screen.getByLabelText('Posizione'),{target:{value:'balcony'}});
    fireEvent.change(screen.getByLabelText('Note private'),{target:{value:'Fioritura primavera'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    await waitFor(async()=>{
      expect((await repo.read()).data.plants.feijoa.cultivar).toBe('Apollo');
    });
    const saved=await repo.read();
    expect(saved.pending).toHaveLength(3);
    expect(saved.data.plants.feijoa).toMatchObject({
      commonName:'Feijoa Apollo',cultivar:'Apollo',potLiters:50,
      minimumTemperatureC:-5,placeId:'balcony',notes:'Fioritura primavera'
    });
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Feijoa Apollo')).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica Feijoa Apollo'}));
    expect((screen.getByLabelText('Capacità vaso (litri)') as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText('Cultivar') as HTMLInputElement).value).toBe('Apollo');
  });

  it('removes optional fields by explicit null and does not journal a no-op save',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'papaya',commonName:'Papaya',scientificName:'Carica papaya',
      notes:'Vecchia nota',potLiters:60,minimumTemperatureC:5,
      origin:'seed',status:'active'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Papaya')).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica Papaya'}));
    fireEvent.change(screen.getByLabelText('Nome scientifico dell’esemplare'),{target:{value:''}});
    fireEvent.change(screen.getByLabelText('Note private'),{target:{value:''}});
    fireEvent.change(screen.getByLabelText('Capacità vaso (litri)'),{target:{value:''}});
    fireEvent.change(screen.getByLabelText('Temperatura minima (°C)'),{target:{value:''}});
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    await waitFor(async()=>expect((await repo.read()).pending).toHaveLength(2));
    const saved=await repo.read();
    expect(saved.data.plants.papaya.scientificName).toBeUndefined();
    expect(saved.data.plants.papaya.notes).toBeUndefined();
    expect(saved.data.plants.papaya.potLiters).toBeUndefined();
    expect(saved.data.plants.papaya.minimumTemperatureC).toBeUndefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica Papaya'}));
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    expect(await screen.findByText('Nessuna modifica da salvare.')).toBeDefined();
    expect((await repo.read()).pending).toHaveLength(2);
  });

  it('rejects a stale form after another tab changes the record instead of overwriting it',async()=>{
    const name='m8a-shared-'+(++seq);
    const a=new LocalGardenRepository('user:alice',{dbName:name,now:()=>1000});
    const b=new LocalGardenRepository('user:alice',{dbName:name,now:()=>1000});
    await a.commit({type:'plant.create',plant:{
      id:'guava',commonName:'Guava rossa',origin:'purchased',status:'active'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={a} isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Guava rossa')).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica Guava rossa'}));
    fireEvent.change(screen.getByLabelText('Nome dell’esemplare *'),{target:{value:'Guava modificata'}});
    await b.commit({type:'plant.patch',id:'guava',patch:{notes:'Nota da un altro tab'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Archivio modificato altrove: aggiorna i dati prima di salvare');
    const stored=await b.read();
    expect(stored.data.plants.guava.commonName).toBe('Guava rossa');
    expect(stored.data.plants.guava.notes).toBe('Nota da un altro tab');
    expect(stored.pending).toHaveLength(2);
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
