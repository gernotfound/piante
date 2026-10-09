import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, FileCheck2, RotateCcw } from 'lucide-react';
import type { LocalEnvelope, LocalGardenRepository } from '../storage/localRepository';
import {
  MAX_BACKUP_BYTES, createLocalBackup, inspectLocalBackup, restoreLocalBackup,
  type BackupInspection
} from './localBackup';

interface Props {
  ownerScope: string;
  repository: LocalGardenRepository;
  isStillAuthorized: () => boolean;
  onRestored: (value:LocalEnvelope)=>void;
}
const toMessage=(error:unknown)=>error instanceof Error?error.message:'Operazione backup fallita';
export function BackupPanel({ownerScope,repository,isStillAuthorized,onRestored}:Props){
  const [selected,setSelected]=useState<{text:string;inspection:BackupInspection}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  async function download(){
    if(busy||!isStillAuthorized())return;
    setBusy(true);setError('');setNotice('');
    try{
      const content=await createLocalBackup(repository,ownerScope,isStillAuthorized);
      if(!mounted.current||!isStillAuthorized())return;
      const blob=new Blob([content],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      try {
        const anchor=document.createElement('a');
        anchor.href=url;
        anchor.download='piante-backup-'+new Date().toISOString().slice(0,10)+'.json';
        anchor.style.display='none';
        document.body.appendChild(anchor);
        try{anchor.click();}
        finally{anchor.remove();}
        setNotice('Download avviato. Verifica che il file sia stato salvato e custodiscilo in un luogo sicuro.');
      }finally{
        // Allow the browser to begin the file transfer before releasing the URL.
        setTimeout(()=>URL.revokeObjectURL(url),0);
      }
    }catch(e){if(mounted.current)setError(toMessage(e));}
    finally{if(mounted.current)setBusy(false);}
  }
  async function chooseFile(event:ChangeEvent<HTMLInputElement>){
    const file=event.currentTarget.files?.[0];
    setSelected(null);setError('');setNotice('');
    if(!file)return;
    if(file.size>MAX_BACKUP_BYTES){setError('File oltre il limite di 32 MiB');return;}
    setBusy(true);
    try{
      const raw=await file.text();
      if(!mounted.current||!isStillAuthorized())return;
      const inspection=await inspectLocalBackup(raw,ownerScope,isStillAuthorized);
      if(mounted.current&&isStillAuthorized())setSelected({text:raw,inspection});
    }catch(e){if(mounted.current)setError(toMessage(e));}
    finally{if(mounted.current)setBusy(false);}
  }
  async function restore(){
    if(busy||!selected||!isStillAuthorized())return;
    setBusy(true);setError('');setNotice('');
    try{
      const next=await restoreLocalBackup(repository,selected.text,ownerScope,isStillAuthorized);
      if(mounted.current&&isStillAuthorized()){
        onRestored(next);setSelected(null);
        setNotice('Ripristino locale confermato. Archivio isolato dal cloud per evitare duplicazioni tra dispositivi.');
      }
    }catch(e){if(mounted.current)setError(toMessage(e));}
    finally{if(mounted.current)setBusy(false);}
  }
  return <section className="garden-section garden-backup" aria-label="Backup e ripristino locali">
    <h3><FileCheck2 size={20}/> Backup del tuo archivio</h3>
    <p>Esporta tutte le schede private, il diario, i luoghi e il journal in un file JSON. Il download contiene dati personali <strong>in chiaro</strong>: custodiscilo con attenzione.</p>
    <button className="garden-backup__action" type="button" disabled={busy}
      onClick={()=>void download()}><Download size={17}/> Esporta backup JSON</button>
    <p>Ripristino: scegli un backup del <strong>tuo stesso account</strong>. Per evitare sovrascritture è possibile importarlo <strong>soltanto in un archivio completamente vuoto</strong>. L'archivio importato rimane escluso dalla futura sincronizzazione cloud finché non sarà implementata una migrazione sicura.</p>
    <label htmlFor="garden-backup-file">Seleziona backup JSON</label>
    <input id="garden-backup-file" type="file" accept=".json,application/json" disabled={busy}
      onChange={event=>void chooseFile(event)}/>
    {selected && <div className="garden-backup__preview" role="status">
      <strong>Backup verificato — solo anteprima</strong>
      <span>Esportato: {new Date(selected.inspection.exportedAt).toLocaleString('it-IT')}</span>
      <span>{selected.inspection.plants} piante · {selected.inspection.places} luoghi · {selected.inspection.events} eventi</span>
      <span>{selected.inspection.pending} operazioni pendenti · {selected.inspection.remoteReceipts} ricevute remote</span>
      <button type="button" className="garden-backup__action" disabled={busy}
        onClick={()=>void restore()}><RotateCcw size={17}/> Conferma ripristino su archivio vuoto</button>
    </div>}
    {error&&<p role="alert" className="garden-feedback garden-feedback--error">{error}</p>}
    {notice&&<p role="status" className="garden-feedback">{notice}</p>}
  </section>;
}
