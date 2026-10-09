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
    .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt-a.createdAt);

  async function save(operation: DomainOperation | (()=>DomainOperation), success: string) {
    if (busy || !isStillAuthorized()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await repo.commit(typeof operation === 'function' ? operation() : operation, isStillAuthorized);
      if (!isStillAuthorized()) return;
      setSnapshot(next); // strictly AFTER the IDB transaction completes
      setNotice(success + ' · Solo su questo dispositivo, non sincronizzato.');
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
    if (!isStillAuthorized()) return;
    if (!diaryPlantId || !diaryDate) { setError('Seleziona una pianta e una data.'); return; }
    void save(() => ({type:'event.add',event:{
      id:newId(),plantId:diaryPlantId,date:diaryDate,type:diaryType,
      ...(diaryNote.trim() ? {note:diaryNote.trim()} : {})
    }}), 'Voce di diario salvata');
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
                  void save({type:'plant.patch',id:plant.id,patch:{status}},'Stato aggiornato');
                }}>
                <option value="active">Attiva</option>
                <option value="archived">Archiviata</option>
                <option value="dead">Deceduta</option>
              </select>
            </div>
          </li>)}</ul>}
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
          <select id="garden-diary-type" value={diaryType} onChange={e=>setDiaryType(e.target.value as keyof typeof diaryTypes)}>
            {Object.entries(diaryTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="garden-diary-date">Data *</label>
          <input id="garden-diary-date" type="date" required value={diaryDate} onChange={e=>setDiaryDate(e.target.value)}/>
          <label htmlFor="garden-diary-note">Note (private)</label>
          <textarea id="garden-diary-note" maxLength={10000} rows={3} value={diaryNote} onChange={e=>setDiaryNote(e.target.value)}/>
          <button type="submit" disabled={busy||!plants.length}><Plus size={17}/> {busy?'Salvataggio…':'Salva nel diario'}</button>
        </form>}
      </section>
    </div>
    {events.length>0 && <section className="garden-section garden-diary" aria-label="Ultimi eventi">
      <h3><BookOpen size={20}/> Diario recente</h3>
      <ul>{events.slice(0,8).map(event=><li key={event.id}>
        <time dateTime={event.date}>{event.date}</time>
        <strong>{snapshot?.data.plants[event.plantId]?.commonName ?? 'Pianta non disponibile'}</strong>
        <span>{diaryTypes[event.type]}{event.note ? ` · ${event.note}` : ''}</span>
      </li>)}</ul>
    </section>}
    <BackupPanel ownerScope={ownerScope} repository={repo} isStillAuthorized={isStillAuthorized}
      onRestored={value=>{if(isStillAuthorized()){setSnapshot(value);setNotice('Archivio ripristinato in modo durevole; sincronizzazione cloud bloccata.');}}}/>
    {snapshot?.backupQuarantined && <p className="garden-feedback garden-feedback--error" role="status">
      Backup ripristinato: la sincronizzazione cloud è bloccata per proteggere l'identità della replica.
    </p>}
    <p className="garden-privacy">Area sperimentale: nessun dato viene pubblicato. I backup JSON non sono cifrati e non esiste ancora un ripristino cloud automatico. Conserva una copia protetta in un luogo sicuro.</p>
  </section>;
}
