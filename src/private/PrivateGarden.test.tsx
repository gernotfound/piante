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

  it('saves height and soil pH in the journal and renders them after a repository reload',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'papaya',commonName:'Papaya',origin:'seed',status:'active'
    }});
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    await screen.findByText('Papaya');
    fireEvent.click(screen.getByRole('button',{name:'Diario'}));
    fireEvent.change(screen.getByLabelText('Pianta *'),{target:{value:'papaya'}});
    fireEvent.change(screen.getByLabelText('Attività'),{target:{value:'measurement'}});
    fireEvent.change(screen.getByLabelText('Altezza (cm)'),{target:{value:'125.5'}});
    fireEvent.change(screen.getByLabelText('pH del terreno'),{target:{value:'6.2'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva nel diario'}));
    await waitFor(async()=>expect(Object.keys((await repo.read()).data.events)).toHaveLength(1));
    const persisted=await repo.read();
    expect(persisted.pending).toHaveLength(2);
    expect(Object.values(persisted.data.events)[0]).toMatchObject({
      plantId:'papaya',type:'measurement',heightCm:125.5,soilPh:6.2
    });
    expect(await screen.findByText(/Altezza 125.5 cm.*pH 6.2/)).toBeDefined();
    expect((screen.getByLabelText('Altezza (cm)') as HTMLInputElement).value).toBe('');
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText(/Altezza 125.5 cm.*pH 6.2/)).toBeDefined();
  });

  it('records harvest grams without leaking stale measurements into another activity',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'avocado',commonName:'Avocado',origin:'seed',status:'active'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    await screen.findByText('Avocado');
    fireEvent.click(screen.getByRole('button',{name:'Diario'}));
    fireEvent.change(screen.getByLabelText('Pianta *'),{target:{value:'avocado'}});
    fireEvent.change(screen.getByLabelText('Attività'),{target:{value:'measurement'}});
    fireEvent.change(screen.getByLabelText('Altezza (cm)'),{target:{value:'40'}});
    fireEvent.change(screen.getByLabelText('Attività'),{target:{value:'harvest'}});
    expect(screen.queryByLabelText('Altezza (cm)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Peso raccolto (g)'),{target:{value:'325.75'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva nel diario'}));
    await waitFor(async()=>expect(Object.keys((await repo.read()).data.events)).toHaveLength(1));
    const event=Object.values((await repo.read()).data.events)[0];
    expect(event).toMatchObject({type:'harvest',harvestGrams:325.75});
    expect(event.heightCm).toBeUndefined();
    expect(event.soilPh).toBeUndefined();
    expect(await screen.findByText(/Raccolto 325.75 g/)).toBeDefined();
    fireEvent.change(screen.getByLabelText('Attività'),{target:{value:'measurement'}});
    expect((screen.getByLabelText('Altezza (cm)') as HTMLInputElement).value).toBe('');
  });

  it('rejects out-of-range diary values without changing IndexedDB or claiming a save',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'feijoa',commonName:'Feijoa',origin:'cutting',status:'active'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    await screen.findByText('Feijoa');
    fireEvent.click(screen.getByRole('button',{name:'Diario'}));
    fireEvent.change(screen.getByLabelText('Pianta *'),{target:{value:'feijoa'}});
    fireEvent.change(screen.getByLabelText('Attività'),{target:{value:'measurement'}});
    fireEvent.change(screen.getByLabelText('pH del terreno'),{target:{value:'15'}});
    fireEvent.submit(screen.getByRole('form',{name:'Aggiungi diario'}));
    expect((await screen.findByRole('alert')).textContent)
      .toContain('Valore numerico non valido per il diario');
    expect((await repo.read()).pending).toHaveLength(1);
    expect(Object.keys((await repo.read()).data.events)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('pH del terreno'),{target:{value:'0'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva nel diario'}));
    await waitFor(async()=>expect((await repo.read()).pending).toHaveLength(2));
    expect(Object.values((await repo.read()).data.events)[0].soilPh).toBe(0);
  });

  it('does not append a diary event from a form made stale by another tab',async()=>{
    const dbName='m8c-diary-concurrent-'+(++seq);
    const a=new LocalGardenRepository('user:alice',{dbName,now:()=>1000});
    const b=new LocalGardenRepository('user:alice',{dbName,now:()=>1000});
    await a.commit({type:'plant.create',plant:{
      id:'guava',commonName:'Guava',origin:'seed',status:'active'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={a} isStillAuthorized={()=>true}/>);
    await screen.findByText('Guava');
    fireEvent.click(screen.getByRole('button',{name:'Diario'}));
    fireEvent.change(screen.getByLabelText('Pianta *'),{target:{value:'guava'}});
    await b.commit({type:'plant.patch',id:'guava',patch:{notes:'Un altro dispositivo'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva nel diario'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Archivio modificato altrove: aggiorna i dati prima di salvare');
    const after=await b.read();
    expect(after.pending).toHaveLength(2);
    expect(Object.keys(after.data.events)).toHaveLength(0);
  });

  it('opens every diary entry across pages and filters without changing the local journal',async()=>{
    const repo=local();
    for(const [id,name] of [['papaya','Papaya'],['guava','Guava'],['empty','Senza eventi']]){
      await repo.commit({type:'plant.create',plant:{
        id,commonName:name,origin:'seed',status:'active'
      }});
    }
    for(let i=1;i<=24;i++){
      await repo.commit({type:'event.add',event:{
        id:'history-'+i,plantId:i%2===0?'guava':'papaya',
        date:'2026-09-'+String(i).padStart(2,'0'),
        type:i%3===0?'harvest':i%3===1?'measurement':'observation',
        note:'Evento '+i,
        ...(i===24?{harvestGrams:250}:{})
      }});
    }
    const before=await repo.read();
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText(/Eventi 1–10 di 24 · Pagina 1 di 3/)).toBeDefined();
    expect(screen.getByText(/Evento 24/)).toBeDefined();
    expect(screen.queryByText(/Evento 14$/)).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Successivi'}));
    expect(screen.getByText(/Eventi 11–20 di 24 · Pagina 2 di 3/)).toBeDefined();
    expect(screen.getByText(/Evento 14$/)).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Successivi'}));
    expect(screen.getByText(/Eventi 21–24 di 24 · Pagina 3 di 3/)).toBeDefined();
    expect(screen.getByText(/Evento 1$/)).toBeDefined();
    expect((screen.getByRole('button',{name:'Successivi'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Filtra per pianta'),{target:{value:'guava'}});
    expect(screen.getByText(/Eventi 1–10 di 12 · Pagina 1 di 2/)).toBeDefined();
    fireEvent.change(screen.getByLabelText('Filtra per attività'),{target:{value:'harvest'}});
    expect(screen.getByText(/Eventi 1–4 di 4 · Pagina 1 di 1/)).toBeDefined();
    expect(screen.getByText(/Raccolto 250 g/)).toBeDefined();
    expect(screen.queryByText(/Evento 23$/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Filtra per pianta'),{target:{value:'empty'}});
    expect(screen.getByText('Nessun evento corrisponde ai filtri.')).toBeDefined();
    expect(screen.queryByRole('button',{name:'Successivi'})).toBeNull();
    expect(await repo.read()).toEqual(before);
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText(/Eventi 1–10 di 24 · Pagina 1 di 3/)).toBeDefined();
    expect(await repo.read()).toEqual(before);
  });

  it('orders equal-date diary entries deterministically after reload, including text-only records',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'plant',commonName:'Pianta',origin:'seed',status:'active'
    }});
    for(const id of ['c','a','b']){
      await repo.commit({type:'event.add',event:{
        id,plantId:'plant',date:'2026-09-01',type:'care',note:'Voce '+id
      }});
    }
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText(/Eventi 1–3 di 3/)).toBeDefined();
    const list=screen.getByRole('list',{name:'Elenco registrazioni diario'});
    expect(Array.from(list.querySelectorAll('li')).map(li=>li.textContent))
      .toEqual(expect.arrayContaining([expect.stringContaining('Voce a'),
        expect.stringContaining('Voce b'),expect.stringContaining('Voce c')]));
    expect(Array.from(list.querySelectorAll('li')).map(li=>li.textContent?.match(/Voce ([abc])/ )?.[1]))
      .toEqual(['a','b','c']);
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText(/Eventi 1–3 di 3/)).toBeDefined();
    expect(Array.from(screen.getByRole('list',{name:'Elenco registrazioni diario'})
      .querySelectorAll('li')).map(li=>li.textContent?.match(/Voce ([abc])/ )?.[1]))
      .toEqual(['a','b','c']);
  });

  it('creates a cutting with a stable mother link and a seedling with both parents',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'mother',commonName:'Passiflora madre',origin:'seed',status:'active'
    }});
    await repo.commit({type:'plant.create',plant:{
      id:'father',commonName:'Passiflora padre',origin:'purchased',status:'active'
    }});
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Passiflora madre')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Nome comune *'),{target:{value:'Talea di passiflora'}});
    fireEvent.change(screen.getByLabelText('Origine'),{target:{value:'cutting'}});
    fireEvent.change(screen.getByLabelText('Pianta madre (se nota)'),{target:{value:'mother'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva pianta'}));
    await waitFor(async()=>expect(Object.values((await repo.read()).data.plants)).toHaveLength(3));
    const cutting=Object.values((await repo.read()).data.plants)
      .find(plant=>plant.commonName==='Talea di passiflora');
    expect(cutting).toMatchObject({origin:'cutting',motherId:'mother'});
    expect(cutting?.fatherId).toBeUndefined();
    expect(screen.getByText('Madre: Passiflora madre')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Nome comune *'),{target:{value:'Ibrido di passiflora'}});
    fireEvent.change(screen.getByLabelText('Origine'),{target:{value:'seed'}});
    fireEvent.change(screen.getByLabelText('Pianta madre (se nota)'),{target:{value:'mother'}});
    fireEvent.change(screen.getByLabelText('Pianta padre (se nota)'),{target:{value:'father'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva pianta'}));
    await waitFor(async()=>expect(Object.values((await repo.read()).data.plants)).toHaveLength(4));
    const seedling=Object.values((await repo.read()).data.plants)
      .find(plant=>plant.commonName==='Ibrido di passiflora');
    expect(seedling).toMatchObject({motherId:'mother',fatherId:'father',origin:'seed'});
    expect(screen.getByText('Padre: Passiflora padre')).toBeDefined();
    expect((await repo.read()).pending).toHaveLength(4);
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Padre: Passiflora padre')).toBeDefined();
    expect((await repo.read()).data.plants[seedling!.id].motherId).toBe('mother');
  });

  it('edits parent references, updates linked names after a rename, and clears an optional parent',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'mom',commonName:'Pianta originale',origin:'cutting',status:'active'
    }});
    await repo.commit({type:'plant.create',plant:{
      id:'dad',commonName:'Impollinatore',origin:'seed',status:'active'
    }});
    await repo.commit({type:'plant.create',plant:{
      id:'child',commonName:'Figlia',origin:'seed',status:'active',motherId:'mom'
    }});
    const {unmount}=render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Modifica Figlia'}));
    expect((screen.getByLabelText('Pianta madre dell’esemplare') as HTMLSelectElement).value).toBe('mom');
    expect(screen.queryByRole('option',{name:'Figlia'})).not.toBeNull(); // other selectors also include this plant
    const mother=screen.getByLabelText('Pianta madre dell’esemplare') as HTMLSelectElement;
    expect(Array.from(mother.options).some(o=>o.value==='child')).toBe(false);
    fireEvent.change(screen.getByLabelText('Pianta padre dell’esemplare'),{target:{value:'dad'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    await waitFor(async()=>expect((await repo.read()).data.plants.child.fatherId).toBe('dad'));
    fireEvent.click(screen.getByRole('button',{name:'Modifica Pianta originale'}));
    fireEvent.change(screen.getByLabelText('Nome dell’esemplare *'),{target:{value:'Pianta madre rinominata'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    await waitFor(async()=>expect((await repo.read()).data.plants.mom.commonName).toBe('Pianta madre rinominata'));
    expect(screen.getByText('Madre: Pianta madre rinominata')).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica Figlia'}));
    fireEvent.change(screen.getByLabelText('Pianta madre dell’esemplare'),{target:{value:''}});
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    await waitFor(async()=>expect((await repo.read()).data.plants.child.motherId).toBeUndefined());
    expect((await repo.read()).data.plants.child.fatherId).toBe('dad');
    expect((await repo.read()).pending).toHaveLength(6);
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    expect(await screen.findByText('Padre: Impollinatore')).toBeDefined();
    expect(screen.queryByText('Madre: Pianta madre rinominata')).toBeNull();
  });

  it('rejects genealogical cycles and preserves the previously saved IndexedDB journal',async()=>{
    const repo=local();
    await repo.commit({type:'plant.create',plant:{
      id:'mom',commonName:'Madre',origin:'seed',status:'active'
    }});
    await repo.commit({type:'plant.create',plant:{
      id:'child',commonName:'Figlia',origin:'cutting',status:'active',motherId:'mom'
    }});
    const before=await repo.read();
    render(<PrivateGarden ownerScope="user:alice" repository={repo}
      isStillAuthorized={()=>true}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Modifica Madre'}));
    fireEvent.change(screen.getByLabelText('Pianta madre dell’esemplare'),{
      target:{value:'child'}
    });
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    expect((await screen.findByRole('alert')).textContent).toContain('Genealogia ciclica');
    expect(await repo.read()).toEqual(before);
  });

  it('rejects a stale family-link change from another tab without losing any records',async()=>{
    const dbName='m8e-lineage-shared-'+(++seq);
    const a=new LocalGardenRepository('user:alice',{dbName,now:()=>1000});
    const b=new LocalGardenRepository('user:alice',{dbName,now:()=>1000});
    await a.commit({type:'plant.create',plant:{
      id:'mother',commonName:'Madre',origin:'seed',status:'active'
    }});
    await a.commit({type:'plant.create',plant:{
      id:'child',commonName:'Figlia',origin:'cutting',status:'active'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={a}
      isStillAuthorized={()=>true}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Modifica Figlia'}));
    fireEvent.change(screen.getByLabelText('Pianta madre dell’esemplare'),{
      target:{value:'mother'}
    });
    await b.commit({type:'plant.patch',id:'child',patch:{notes:'Aggiornamento da altro tab'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva dettagli'}));
    expect((await screen.findByRole('alert')).textContent)
      .toContain('Archivio modificato altrove');
    const state=await b.read();
    expect(state.data.plants.child.motherId).toBeUndefined();
    expect(state.data.plants.child.notes).toBe('Aggiornamento da altro tab');
    expect(state.pending).toHaveLength(3);
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

  it('edits place name/kind/notes durably and preserves plant references, coordinates and journal',async()=>{
    const repo=local();
    await repo.commit({type:'place.create',place:{
      id:'balcony',name:'Balcone',kind:'balcony',latitude:40.7,longitude:14.7,notes:'Esposto a ovest'
    }});
    await repo.commit({type:'plant.create',plant:{
      id:'passiflora',commonName:'Passiflora',placeId:'balcony',origin:'cutting',status:'active'
    }});
    const {unmount}=render(<PrivateGarden ownerScope="user:alice"
      repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByRole('button',{name:'Modifica luogo Balcone'})).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica luogo Balcone'}));
    fireEvent.change(screen.getByLabelText('Nome luogo da modificare *'),{target:{value:'Serra'}});
    fireEvent.change(screen.getByLabelText('Tipologia del luogo'),{target:{value:'greenhouse'}});
    fireEvent.change(screen.getByLabelText('Note private del luogo'),{
      target:{value:'Riparo dalle gelate'}
    });
    fireEvent.click(screen.getByRole('button',{name:'Salva luogo modificato'}));
    await waitFor(async()=>expect((await repo.read()).data.places.balcony.name).toBe('Serra'));
    const updated=await repo.read();
    expect(updated.data.places.balcony).toMatchObject({
      id:'balcony',name:'Serra',kind:'greenhouse',notes:'Riparo dalle gelate',
      latitude:40.7,longitude:14.7
    });
    expect(updated.data.plants.passiflora.placeId).toBe('balcony');
    expect(updated.pending).toHaveLength(3);
    unmount();
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    expect(await screen.findByRole('button',{name:'Modifica luogo Serra'})).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica luogo Serra'}));
    expect((screen.getByLabelText('Tipologia del luogo') as HTMLSelectElement).value)
      .toBe('greenhouse');
    expect((screen.getByLabelText('Note private del luogo') as HTMLTextAreaElement).value)
      .toBe('Riparo dalle gelate');
  });

  it('clears optional place notes and does not append a journal operation for a no-op',async()=>{
    const repo=local();
    await repo.commit({type:'place.create',place:{
      id:'indoor',name:'Salotto',kind:'indoor',notes:'Da rinvasare'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Modifica luogo Salotto'}));
    fireEvent.change(screen.getByLabelText('Note private del luogo'),{target:{value:''}});
    fireEvent.click(screen.getByRole('button',{name:'Salva luogo modificato'}));
    await waitFor(async()=>expect((await repo.read()).pending).toHaveLength(2));
    expect((await repo.read()).data.places.indoor.notes).toBeUndefined();
    fireEvent.click(screen.getByRole('button',{name:'Modifica luogo Salotto'}));
    fireEvent.click(screen.getByRole('button',{name:'Salva luogo modificato'}));
    expect(await screen.findByText('Nessuna modifica da salvare.')).toBeDefined();
    expect((await repo.read()).pending).toHaveLength(2);
  });

  it('rejects place editor changes from a stale tab without overwriting the newer state',async()=>{
    const name='m8b-places-shared-'+(++seq);
    const a=new LocalGardenRepository('user:alice',{dbName:name,now:()=>1000});
    const b=new LocalGardenRepository('user:alice',{dbName:name,now:()=>1000});
    await a.commit({type:'place.create',place:{
      id:'terrace',name:'Terrazzo',kind:'balcony'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={a} isStillAuthorized={()=>true}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Modifica luogo Terrazzo'}));
    fireEvent.change(screen.getByLabelText('Nome luogo da modificare *'),{
      target:{value:'Terrazzo chiuso'}
    });
    await b.commit({type:'place.patch',id:'terrace',patch:{notes:'Cambio dalla seconda scheda'}});
    fireEvent.click(screen.getByRole('button',{name:'Salva luogo modificato'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Archivio modificato altrove: aggiorna i dati prima di salvare');
    const state=await b.read();
    expect(state.data.places.terrace).toMatchObject({
      name:'Terrazzo',notes:'Cambio dalla seconda scheda'
    });
    expect(state.pending).toHaveLength(2);
  });

  it('does not announce a place save or change its data when IndexedDB fails',async()=>{
    const repo=local();
    await repo.commit({type:'place.create',place:{
      id:'room',name:'Stanza',kind:'indoor'
    }});
    render(<PrivateGarden ownerScope="user:alice" repository={repo} isStillAuthorized={()=>true}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Modifica luogo Stanza'}));
    fireEvent.change(screen.getByLabelText('Nome luogo da modificare *'),{
      target:{value:'Stanza nuova'}
    });
    vi.spyOn(repo,'commit').mockRejectedValueOnce(new Error('IDB write aborted'));
    fireEvent.click(screen.getByRole('button',{name:'Salva luogo modificato'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent','IDB write aborted');
    expect((await repo.read()).data.places.room.name).toBe('Stanza');
    expect((await repo.read()).pending).toHaveLength(1);
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
