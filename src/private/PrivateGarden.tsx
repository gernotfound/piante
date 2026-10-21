import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, Leaf, MapPin, Plus, RefreshCw, Sprout } from 'lucide-react';
import { LocalGardenRepository, type LocalEnvelope } from '../storage/localRepository';
import { BackupPanel } from '../backup/BackupPanel';
import type { DomainOperation, Plant, PlantEvent, Place } from '../domain/schema';

type Props = {
  ownerScope: string;
  /** Injectable for offline/identity regression tests. Never a cloud adapter. */
  repository?: LocalGardenRepository;
  isStillAuthorized: () => boolean;
};

type FormKind = 'plant' | 'place' | 'diary';

const origins = {
  seed: 'Seme', cutting: 'Talea', graft: 'Innesto',
  purchased: 'Acquistata', unknown: 'Non specificata'
} as const;
const places = {
  balcony: 'Balcone', garden: 'Giardino', indoor: 'Interno',
  greenhouse: 'Serra', other: 'Altro'
} as const;
const HISTORY_PAGE_SIZE = 10;
const diaryTypes = {
  observation: 'Osservazione', care: 'Cura', measurement: 'Misurazione',
  flowering: 'Fioritura', fruiting: 'Fruttificazione', harvest: 'Raccolta'
} as const;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function newId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Identificatori sicuri non disponibili: salvataggio bloccato.');
  }
  return crypto.randomUUID();
}
const message = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Operazione non riuscita; nessun salvataggio confermato.';

/**
 * Explicitly invited test accounts ONLY; parent must enforce authorized Auth
 * state and unmount on logout/account changes. All operations remain on IDB.
 */
export function PrivateGarden({ownerScope, repository, isStillAuthorized}: Props) {
  const repo = useMemo(
    () => repository ?? new LocalGardenRepository(ownerScope),
    [ownerScope, repository]
  );
  const [snapshot, setSnapshot] = useState<LocalEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<FormKind>('plant');
  const [plantName, setPlantName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [origin, setOrigin] = useState<keyof typeof origins>('unknown');
  const [placeName, setPlaceName] = useState('');
  const [placeKind, setPlaceKind] = useState<keyof typeof places>('balcony');
  const [placeId, setPlaceId] = useState('');
  const [diaryPlantId, setDiaryPlantId] = useState('');
  const [diaryType, setDiaryType] = useState<keyof typeof diaryTypes>('observation');
  const [diaryDate, setDiaryDate] = useState(localToday);
  const [diaryNote, setDiaryNote] = useState('');
  const [diaryHeight, setDiaryHeight] = useState('');
  const [diarySoilPh, setDiarySoilPh] = useState('');
  const [diaryHarvest, setDiaryHarvest] = useState('');
  const [historyPlantId,setHistoryPlantId] = useState('');
  const [historyType,setHistoryType] = useState('');
  const [historyPage,setHistoryPage] = useState(0);
  const [editingPlantId,setEditingPlantId]=useState('');
  const [editRevision,setEditRevision]=useState<number|null>(null);
  const [editName,setEditName]=useState('');
  const [editScientific,setEditScientific]=useState('');
  const [editCultivar,setEditCultivar]=useState('');
  const [editPlaceId,setEditPlaceId]=useState('');
  const [editPot,setEditPot]=useState('');
  const [editMinTemp,setEditMinTemp]=useState('');
  const [editNotes,setEditNotes]=useState('');
  const [editingPlaceId,setEditingPlaceId]=useState('');
  const [editPlaceRevision,setEditPlaceRevision]=useState<number|null>(null);
  const [editPlaceName,setEditPlaceName]=useState('');
  const [editPlaceKind,setEditPlaceKind]=useState<keyof typeof places>('balcony');
  const [editPlaceNotes,setEditPlaceNotes]=useState('');


  useEffect(() => {
    let active = true;
    setSnapshot(null); setLoading(true); setError(''); setNotice('');
    void repo.read().then(value => {
      if (active && isStillAuthorized()) { setSnapshot(value); setLoading(false); }
    }).catch(err => {
      if (active && isStillAuthorized()) { setError(message(err)); setLoading(false); }
    });
    return () => { active = false; };
  }, [repo]);

  const plants: Plant[] = Object.values(snapshot?.data.plants ?? {})
    .sort((a,b) => a.commonName.localeCompare(b.commonName, 'it'));
  const locations: Place[] = Object.values(snapshot?.data.places ?? {})
    .sort((a,b) => a.name.localeCompare(b.name,'it'));
  const events: PlantEvent[] = Object.values(snapshot?.data.events ?? {})
    .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt-a.createdAt || a.id.localeCompare(b.id));
  // Read-only projection: filters and pagination never modify IndexedDB or its journal.
  const history = events.filter(event=>
    (!historyPlantId||event.plantId===historyPlantId) &&
    (!historyType||event.type===historyType)
  );
  const historyPages = Math.max(1,Math.ceil(history.length/HISTORY_PAGE_SIZE));
  const historyCurrentPage = Math.min(historyPage,historyPages-1);
  const historyStart = historyCurrentPage*HISTORY_PAGE_SIZE;
  const historyVisible = history.slice(historyStart,historyStart+HISTORY_PAGE_SIZE);

  async function save(
    operation: DomainOperation | (()=>DomainOperation), success: string,
    expectedRevision?:number,onSaved?:()=>void
  ) {
    if (busy || !isStillAuthorized()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await repo.commit(typeof operation === 'function' ? operation() : operation,
        isStillAuthorized,expectedRevision);
      if (!isStillAuthorized()) return;
      setSnapshot(next); // strictly AFTER the IDB transaction completes
      setNotice(success + ' · Solo su questo dispositivo, non sincronizzato.');
      onSaved?.();
    } catch (cause) {
      if (!isStillAuthorized()) return;
      setError(message(cause));
      // Re-read after a failure: another tab may have committed while our
      // operation failed. Never erase the old visible state on read failure.
      try { const latest = await repo.read(); if (isStillAuthorized()) setSnapshot(latest); }
      catch (readError) { if (isStillAuthorized()) setError(message(readError)); }
    } finally { setBusy(false); }
  }
  function addPlant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isStillAuthorized()) return;
    const name = plantName.trim();
    if (!name) { setError('Inserisci il nome della pianta.'); return; }
    void save(() => ({type:'plant.create',plant:{
      id: newId(), commonName: name, origin, status: 'active',
      ...(scientificName.trim() ? {scientificName: scientificName.trim()} : {}),
      ...(placeId ? {placeId} : {})
    }}), 'Pianta salvata');
  }
  function addPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isStillAuthorized()) return;
    if (!placeName.trim()) { setError('Inserisci il nome del luogo.'); return; }
    void save(() => ({type:'place.create',place:{id:newId(),name:placeName.trim(),kind:placeKind}}),'Luogo salvato');
  }
  function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isStillAuthorized() || busy || !snapshot) return;
    if (!diaryPlantId || !diaryDate) { setError('Seleziona una pianta e una data.'); return; }
    // Validate the exact fields belonging to this event type before journaling.
    // No hidden values from a previous type can leak into a new event.
    const values: { heightCm?:number; soilPh?:number; harvestGrams?:number } = {};
    for (const [kind,raw,min,max] of [
      ['heightCm',diaryType==='measurement'?diaryHeight:'',0,100000],
      ['soilPh',diaryType==='measurement'?diarySoilPh:'',0,14],
      ['harvestGrams',diaryType==='harvest'?diaryHarvest:'',0,100000000]
    ] as const) {
      if (!raw.trim()) continue;
      const number=Number(raw);
      if (!Number.isFinite(number)||number<min||number>max) {
        setError('Valore numerico non valido per il diario: controlla le unità e i limiti.');
        return;
      }
      values[kind]=number;
    }
    void save(() => ({type:'event.add',event:{
      id:newId(),plantId:diaryPlantId,date:diaryDate,type:diaryType,
      ...(diaryNote.trim() ? {note:diaryNote.trim()} : {}),
      ...values
    }}), 'Voce di diario salvata',snapshot.revision,()=>{
      setDiaryNote('');setDiaryHeight('');setDiarySoilPh('');setDiaryHarvest('');
    });
  }
  function openPlantEditor(plant:Plant){
    if(busy||!isStillAuthorized()||!snapshot)return;
    setEditingPlantId(plant.id);setEditRevision(snapshot.revision);
    setEditName(plant.commonName);setEditScientific(plant.scientificName??'');
    setEditCultivar(plant.cultivar??'');setEditPlaceId(plant.placeId??'');
    setEditPot(plant.potLiters===undefined?'':String(plant.potLiters));
    setEditMinTemp(plant.minimumTemperatureC===undefined?'':String(plant.minimumTemperatureC));
    setEditNotes(plant.notes??'');setError('');setNotice('');
  }
  function editPlant(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!snapshot||editRevision===null||!isStillAuthorized()||busy)return;
    const previous=snapshot.data.plants[editingPlantId];
    if(!previous){setError('Esemplare non disponibile: aggiorna l’archivio.');return;}
    const name=editName.trim(),scientific=editScientific.trim()||null;
    const cultivar=editCultivar.trim()||null,place=editPlaceId||null;
    const notes=editNotes.trim()||null;
    const pot=editPot.trim()?Number(editPot):null;
    const temperature=editMinTemp.trim()?Number(editMinTemp):null;
    if(!name){setError('Inserisci il nome della pianta.');return;}
    if(previous.commonName===name&&(previous.scientificName??null)===scientific&&
      (previous.cultivar??null)===cultivar&&(previous.placeId??null)===place&&
      (previous.potLiters??null)===pot&&
      (previous.minimumTemperatureC??null)===temperature&&
      (previous.notes??null)===notes){
      setEditingPlantId('');setEditRevision(null);setNotice('Nessuna modifica da salvare.');
      return;
    }
    void save({type:'plant.patch',id:previous.id,patch:{
      commonName:name,scientificName:scientific,cultivar,placeId:place,
      potLiters:pot,minimumTemperatureC:temperature,notes
    }},'Dettagli pianta aggiornati',editRevision,()=>{
      setEditingPlantId('');setEditRevision(null);
    });
  }
  function openPlaceEditor(location:Place){
    if(busy||!isStillAuthorized()||!snapshot)return;
    setEditingPlaceId(location.id);
    setEditPlaceRevision(snapshot.revision);
    setEditPlaceName(location.name);
    setEditPlaceKind(location.kind);
    setEditPlaceNotes(location.notes??'');
    setError('');setNotice('');
  }
  function editPlace(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!snapshot||editPlaceRevision===null||!isStillAuthorized()||busy)return;
    const previous=snapshot.data.places[editingPlaceId];
    if(!previous){setError('Luogo non disponibile: aggiorna l’archivio.');return;}
    const name=editPlaceName.trim();
    const notes=editPlaceNotes.trim()||null;
    if(!name){setError('Inserisci il nome del luogo.');return;}
    if(previous.name===name&&previous.kind===editPlaceKind&&
      (previous.notes??null)===notes){
      setEditingPlaceId('');setEditPlaceRevision(null);
      setNotice('Nessuna modifica da salvare.');
      return;
    }
    void save({type:'place.patch',id:previous.id,patch:{
      name,kind:editPlaceKind,notes
    }},'Luogo aggiornato',editPlaceRevision,()=>{
      setEditingPlaceId('');setEditPlaceRevision(null);
    });
  }
  const pending = snapshot?.pending.length ?? 0;
  if (loading) return <p role="status">Apertura archivio locale…</p>;

  return <section className="private-garden" aria-label="Archivio botanico privato di prova">
    <div className="private-garden__header">
      <div><span className="page-kicker"><Sprout size={17}/> Archivio riservato · Test</span>
        <h2>La tua collezione</h2>
        <p>Questi dati restano in IndexedDB su questo dispositivo. Non sono su Firestore e non sono pubblici.</p>
      </div>
      <button className="garden-refresh" type="button" disabled={busy}
        onClick={() => { if (!isStillAuthorized()) return; setError('');void repo.read().then(v=>{if(isStillAuthorized())setSnapshot(v);}).catch(e=>{if(isStillAuthorized())setError(message(e));}); }}>
        <RefreshCw size={18}/> Aggiorna
      </button>
    </div>
    {error && <p className="garden-feedback garden-feedback--error" role="alert">{error}</p>}
    {notice && <p className="garden-feedback" role="status">{notice}</p>}
    <div className="garden-summary" aria-label="Riepilogo locale">
      <div><strong>{plants.length}</strong><span>Piante</span></div>
      <div><strong>{locations.length}</strong><span>Luoghi</span></div>
      <div><strong>{events.length}</strong><span>Diario</span></div>
      <div><strong>{pending}</strong><span>Modifiche non sincronizzate</span></div>
    </div>
    <div className="garden-layout">
      <section className="garden-section" aria-label="Elenco piante">
        <h3><Leaf size={20} aria-hidden="true"/> Le mie piante</h3>
        {plants.length === 0
          ? <p className="garden-empty">Nessuna pianta nell'archivio locale. Aggiungi il primo esemplare.</p>
          : <ul className="garden-plants">{plants.map(plant=><li key={plant.id} className="garden-plant">
            <div className="garden-plant__body">
              <strong>{plant.commonName}</strong>
              {plant.scientificName && <em>{plant.scientificName}</em>}
              <span>{origins[plant.origin]} · {plant.placeId ? snapshot?.data.places[plant.placeId]?.name ?? 'Luogo non trovato' : 'Luogo non assegnato'}</span>
            </div>
            <div className="garden-plant__actions">
              <label htmlFor={`status-${plant.id}`}>Stato</label>
              <select id={`status-${plant.id}`} value={plant.status}
                disabled={busy}
                onChange={e=>{
                  const status=e.target.value as Plant['status'];
                  void save({type:'plant.patch',id:plant.id,patch:{status}},
                    'Stato aggiornato',snapshot?.revision);
                }}>
                <option value="active">Attiva</option>
                <option value="archived">Archiviata</option>
                <option value="dead">Deceduta</option>
              </select>
              <button type="button" disabled={busy} onClick={()=>openPlantEditor(plant)}>
                Modifica {plant.commonName}
              </button>
            </div>
          </li>)}</ul>}
        {editingPlantId && <form onSubmit={editPlant} className="garden-form garden-plant-editor"
          aria-label="Modifica dettagli pianta">
          <h3>Modifica esemplare</h3>
          <label htmlFor="garden-edit-name">Nome dell’esemplare *</label>
          <input id="garden-edit-name" required maxLength={120} value={editName}
            onChange={e=>setEditName(e.target.value)}/>
          <label htmlFor="garden-edit-scientific">Nome scientifico dell’esemplare</label>
          <input id="garden-edit-scientific" maxLength={160} value={editScientific}
            onChange={e=>setEditScientific(e.target.value)}/>
          <label htmlFor="garden-edit-cultivar">Cultivar</label>
          <input id="garden-edit-cultivar" maxLength={120} value={editCultivar}
            onChange={e=>setEditCultivar(e.target.value)}/>
          <label htmlFor="garden-edit-place">Posizione</label>
          <select id="garden-edit-place" value={editPlaceId} onChange={e=>setEditPlaceId(e.target.value)}>
            <option value="">Non assegnata</option>
            {locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
          <label htmlFor="garden-edit-pot">Capacità vaso (litri)</label>
          <input id="garden-edit-pot" type="number" min="0.01" max="100000" step="any"
            value={editPot} onChange={e=>setEditPot(e.target.value)}/>
          <label htmlFor="garden-edit-temperature">Temperatura minima (°C)</label>
          <input id="garden-edit-temperature" type="number" min="-100" max="100" step="any"
            value={editMinTemp} onChange={e=>setEditMinTemp(e.target.value)}/>
          <label htmlFor="garden-edit-notes">Note private</label>
          <textarea id="garden-edit-notes" rows={3} maxLength={20000}
            value={editNotes} onChange={e=>setEditNotes(e.target.value)}/>
          <button type="submit" disabled={busy}>{busy?'Salvataggio…':'Salva dettagli'}</button>
          <button type="button" disabled={busy} onClick={()=>{setEditingPlantId('');setEditRevision(null);}}>
            Annulla modifica
          </button>
        </form>}
      </section>
      <section className="garden-section" aria-label="Elenco luoghi">
        <h3><MapPin size={20} aria-hidden="true"/> I miei luoghi</h3>
        {locations.length===0
          ? <p className="garden-empty">Nessun luogo nell'archivio locale.</p>
          : <ul className="garden-plants">{locations.map(location=><li key={location.id} className="garden-plant">
              <div className="garden-plant__body">
                <strong>{location.name}</strong>
                <span>{places[location.kind]} · {plants.filter(plant=>plant.placeId===location.id).length} esemplari</span>
                {location.notes && <span className="garden-place__notes">{location.notes}</span>}
              </div>
              <div className="garden-plant__actions">
                <button type="button" disabled={busy} onClick={()=>openPlaceEditor(location)}>
                  Modifica luogo {location.name}
                </button>
              </div>
            </li>)}</ul>}
        {editingPlaceId && <form className="garden-form garden-plant-editor"
          onSubmit={editPlace} aria-label="Modifica dettagli luogo">
          <h3>Modifica luogo</h3>
          <label htmlFor="garden-place-edit-name">Nome luogo da modificare *</label>
          <input id="garden-place-edit-name" required maxLength={120} value={editPlaceName}
            onChange={event=>setEditPlaceName(event.target.value)}/>
          <label htmlFor="garden-place-edit-kind">Tipologia del luogo</label>
          <select id="garden-place-edit-kind" value={editPlaceKind}
            onChange={event=>setEditPlaceKind(event.target.value as keyof typeof places)}>
            {Object.entries(places).map(([value,label])=>
              <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="garden-place-edit-notes">Note private del luogo</label>
          <textarea id="garden-place-edit-notes" maxLength={10000} rows={3}
            value={editPlaceNotes} onChange={event=>setEditPlaceNotes(event.target.value)}/>
          <button type="submit" disabled={busy}>{busy?'Salvataggio…':'Salva luogo modificato'}</button>
          <button type="button" disabled={busy} onClick={()=>{
            setEditingPlaceId('');setEditPlaceRevision(null);
          }}>Annulla modifica luogo</button>
        </form>}
      </section>
      <section className="garden-section" aria-label="Nuova registrazione">
        <div className="garden-tabs" role="group" aria-label="Cosa aggiungere">
          <button type="button" aria-pressed={form==='plant'} onClick={()=>setForm('plant')}><Plus size={16}/> Pianta</button>
          <button type="button" aria-pressed={form==='place'} onClick={()=>setForm('place')}><MapPin size={16}/> Luogo</button>
          <button type="button" aria-pressed={form==='diary'} onClick={()=>setForm('diary')}><BookOpen size={16}/> Diario</button>
        </div>
        {form==='plant' && <form onSubmit={addPlant} className="garden-form" aria-label="Aggiungi pianta">
          <h3>Nuova pianta</h3>
          <label htmlFor="garden-plant-name">Nome comune *</label>
          <input id="garden-plant-name" required maxLength={120} value={plantName} onChange={e=>setPlantName(e.target.value)} placeholder="Es. Avocado Bacon"/>
          <label htmlFor="garden-scientific">Nome scientifico</label>
          <input id="garden-scientific" maxLength={160} value={scientificName} onChange={e=>setScientificName(e.target.value)} placeholder="Es. Persea americana"/>
          <label htmlFor="garden-origin">Origine</label>
          <select id="garden-origin" value={origin} onChange={e=>setOrigin(e.target.value as keyof typeof origins)}>
            {Object.entries(origins).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="garden-place">Luogo</label>
          <select id="garden-place" value={placeId} onChange={e=>setPlaceId(e.target.value)}>
            <option value="">Da assegnare</option>
            {locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
          <button type="submit" disabled={busy}><Plus size={17}/> {busy?'Salvataggio…':'Salva pianta'}</button>
        </form>}
        {form==='place' && <form onSubmit={addPlace} className="garden-form" aria-label="Aggiungi luogo">
          <h3>Nuovo luogo</h3>
          <label htmlFor="garden-location-name">Nome luogo *</label>
          <input id="garden-location-name" required maxLength={120} value={placeName} onChange={e=>setPlaceName(e.target.value)} placeholder="Es. Balcone"/>
          <label htmlFor="garden-kind">Tipo</label>
          <select id="garden-kind" value={placeKind} onChange={e=>setPlaceKind(e.target.value as keyof typeof places)}>
            {Object.entries(places).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <button type="submit" disabled={busy}><Plus size={17}/> {busy?'Salvataggio…':'Salva luogo'}</button>
        </form>}
        {form==='diary' && <form onSubmit={addEvent} className="garden-form" aria-label="Aggiungi diario">
          <h3>Nuova nota di diario</h3>
          <label htmlFor="garden-diary-plant">Pianta *</label>
          <select id="garden-diary-plant" required value={diaryPlantId} onChange={e=>setDiaryPlantId(e.target.value)}>
            <option value="">Scegli una pianta</option>
            {plants.map(plant=><option key={plant.id} value={plant.id}>{plant.commonName}</option>)}
          </select>
          <label htmlFor="garden-diary-type">Attività</label>
          <select id="garden-diary-type" value={diaryType} onChange={e=>{
            setDiaryType(e.target.value as keyof typeof diaryTypes);
            setDiaryHeight('');setDiarySoilPh('');setDiaryHarvest('');
          }}>
            {Object.entries(diaryTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="garden-diary-date">Data *</label>
          <input id="garden-diary-date" type="date" required value={diaryDate} onChange={e=>setDiaryDate(e.target.value)}/>
          {diaryType==='measurement' && <>
            <label htmlFor="garden-diary-height">Altezza (cm)</label>
            <input id="garden-diary-height" type="number" min="0" max="100000" step="any"
              value={diaryHeight} onChange={e=>setDiaryHeight(e.target.value)}/>
            <label htmlFor="garden-diary-ph">pH del terreno</label>
            <input id="garden-diary-ph" type="number" min="0" max="14" step="any"
              value={diarySoilPh} onChange={e=>setDiarySoilPh(e.target.value)}/>
          </>}
          {diaryType==='harvest' && <>
            <label htmlFor="garden-diary-harvest">Peso raccolto (g)</label>
            <input id="garden-diary-harvest" type="number" min="0" max="100000000" step="any"
              value={diaryHarvest} onChange={e=>setDiaryHarvest(e.target.value)}/>
          </>}
          <label htmlFor="garden-diary-note">Note (private)</label>
          <textarea id="garden-diary-note" maxLength={10000} rows={3} value={diaryNote} onChange={e=>setDiaryNote(e.target.value)}/>
          <button type="submit" disabled={busy||!plants.length}><Plus size={17}/> {busy?'Salvataggio…':'Salva nel diario'}</button>
        </form>}
      </section>
    </div>
    {events.length>0 && <section className="garden-section garden-diary" aria-label="Storico diario">
      <h3><BookOpen size={20}/> Storico del diario</h3>
      <div className="garden-history__filters">
        <div className="garden-history__field">
          <label htmlFor="garden-history-plant">Filtra per pianta</label>
          <select id="garden-history-plant" value={historyPlantId} onChange={event=>{
            setHistoryPlantId(event.target.value);
            setHistoryPage(0);
          }}>
            <option value="">Tutte le piante</option>
            {plants.map(plant=><option key={plant.id} value={plant.id}>{plant.commonName}</option>)}
          </select>
        </div>
        <div className="garden-history__field">
          <label htmlFor="garden-history-type">Filtra per attività</label>
          <select id="garden-history-type" value={historyType} onChange={event=>{
            setHistoryType(event.target.value);
            setHistoryPage(0);
          }}>
            <option value="">Tutte le attività</option>
            {Object.entries(diaryTypes).map(([value,label])=>
              <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <p className="garden-history__count" role="status" aria-live="polite">
        {history.length===0
          ? 'Nessun evento corrisponde ai filtri.'
          : `Eventi ${historyStart+1}–${historyStart+historyVisible.length} di ${history.length} · Pagina ${historyCurrentPage+1} di ${historyPages}`}
      </p>
      <ul aria-label="Elenco registrazioni diario">{historyVisible.map(event=><li key={event.id}>
        <time dateTime={event.date}>{event.date}</time>
        <strong>{snapshot?.data.plants[event.plantId]?.commonName ?? 'Pianta non disponibile'}</strong>
        <span>{diaryTypes[event.type]}
          {event.heightCm!==undefined ? ` · Altezza ${event.heightCm} cm` : ''}
          {event.soilPh!==undefined ? ` · pH ${event.soilPh}` : ''}
          {event.harvestGrams!==undefined ? ` · Raccolto ${event.harvestGrams} g` : ''}
          {event.note ? ` · ${event.note}` : ''}
        </span>
      </li>)}</ul>
      {historyPages>1 && <nav className="garden-history__pagination" aria-label="Pagine del diario">
        <button type="button" disabled={historyCurrentPage===0}
          onClick={()=>setHistoryPage(Math.max(0,historyCurrentPage-1))}>Precedenti</button>
        <button type="button" disabled={historyCurrentPage>=historyPages-1}
          onClick={()=>setHistoryPage(Math.min(historyPages-1,historyCurrentPage+1))}>Successivi</button>
      </nav>}
    </section>}
    <BackupPanel ownerScope={ownerScope} repository={repo} isStillAuthorized={isStillAuthorized}
      onRestored={value=>{if(isStillAuthorized()){setSnapshot(value);setNotice('Archivio ripristinato in modo durevole; sincronizzazione cloud bloccata.');}}}/>
    {snapshot?.backupQuarantined && <p className="garden-feedback garden-feedback--error" role="status">
      Backup ripristinato: la sincronizzazione cloud è bloccata per proteggere l'identità della replica.
    </p>}
    <p className="garden-privacy">Area sperimentale: nessun dato viene pubblicato. I backup JSON non sono cifrati e non esiste ancora un ripristino cloud automatico. Conserva una copia protetta in un luogo sicuro.</p>
  </section>;
}
