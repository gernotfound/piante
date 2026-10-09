# Architettura — Piante

## Confini

| Contesto | Responsabilità |
| --- | --- |
| UI | Stato di navigazione, presentazione e accessibilità |
| Dominio | Esemplari botanici, propagazione, diario, luoghi, cure, pubblicazione |
| Repository locale | IndexedDB owner-scoped e journal di operazioni durevoli |
| Replica cloud | Firestore con validazione, migrazioni e retry |
| Proiezione pubblica | Schede con campi consentiti e snapshot confermati |
| Ambiente | Meteo e allerte per luoghi con soglie per esemplare |
| Account | Login, ownership, logout, backup e cancellazione |

## Schema target (PROPOSTA, non live)

```text
piante_users/{uid}
  plants/{plantId}
    events/{eventId}
  places/{placeId}
  images/{imageId}
  expenses/{expenseId}
  wishlist/{itemId}
  settings/{documentId}
piante_profiles/{username}
  plants/{publicPlantId}
  media/{mediaId}
```

Il nome `piante_*` è un namespace di migrazione, non uno schema version.
Le collezioni legacy `users/{uid}/...` non vanno alterate durante il bootstrap.

## Principi
1. Esemplare distinto da specie e cultivar; eventuale identità di madre, padre e propagazioni con ID stabili.
2. Date botaniche locali `YYYY-MM-DD`; timestamp di audit come istanti assoluti.
3. Immagini e diari non ingrossano i documenti esemplare; liste e anteprime restano leggere.
4. Dati remoti trattati come input non fidato e validati con Zod.
5. Preferenze UI, dati privati e proiezioni pubbliche hanno cicli di vita separati.
6. Il modello di sincronizzazione deve preservare cambi concorrenti e gestire gli ack persi.
7. Le quote Firestore Spark fanno parte dei requisiti di prodotto; evitare listener pubblici indiscriminati.

## Sequenza milestone
- **M0**: shell, design system iniziale, route parser testato, CI e contratti (no accesso Firebase).
- **M1**: schema botanico, persistenza IndexedDB, operazioni di dominio e unit test.
- **M2**: Auth, Rules private e replica Firestore, con Emulator e stress/recovery.
- **M3**: collezioni, esemplari, foto, luoghi e propagazione.
- **M4**: diario, cure, raccolti, grafici.
- **M5**: profili e pubblicazione con proiezione sicura, slug e gestione delle immagini.
- **M6**: meteo, QR, mappa, spese, wishlist e notifiche compatibili con l'infrastruttura.
- **M7**: backup/import e hardening, lifecycle e cancellazione account.
- **M8**: cutover controllato dopo verifiche e revisione.

**Nessuna versione numerica di protocolli LogBook è trasferita automaticamente.**


## Stato implementativo M1
- Modello privato di esemplare, luogo ed evento botanico con vincoli e referenze verificate.
- Reducer puro di operazioni `plant.create`, `plant.patch`, `place.create`, `place.patch`, `event.add`.
- Repository IndexedDB owner-scoped: snapshot e journal diventano durevoli atomicamente nella medesima transazione, con sequence e operation ID stabili.
- Read/commit/ack falliscono in presenza di versioni future, dati corrotti o I/O non disponibile.
- Solo foundation: nessun connettore Firestore, login, UI CRUD, pubblicazione o cancellazione account introdotti in M1.

## Stato M2a
- Gateway Auth Google dietro flag test esplicito, `authDomain` isolato su `piante.web.app`.
- Controller sessione fail-closed con owner scope e grant amministrativo esterno.
- Rules private in file test-only e suite Firebase Emulator bloccante in CI.
- **Non ancora implementati**: replica cloud, scritture con ownership, login pubblico, deploy Rules, verifiche OAuth live, cancellazione account. M2b e audit provider restano obbligatori.

## Stato M2b — confine di trasporto cloud
- Contratto append-only di operazioni private, transazioni idempotenti e Rules verificate su Firebase Emulator.
- Ricontrollo di owner, session epoch e journal durevole durante errori ambigui.
- Modulo deliberatamente **non collegato a UI/Auth e non attivo sul provider**. Nessuna hydration, merge cross-device, ack automatico, account deletion o Rules live.
- Specifica: [`docs/architecture/cloud-journal.md`](cloud-journal.md).


## Stato M2c — ispezione cloud sicura
- `firestoreJournalReader`: lettura da server completa, bounded e owner-scoped; errore se il limite impedisce certezza.
- `buildReconciliationPreview`: replay indipendente dalle condizioni di caricamento; fail-closed su lacune, conflitti e corrupt data.
- `inspectRemoteJournal`: invalidazione se cambiano account o IndexedDB durante l'I/O.
- È **solo un'anteprima in memoria**: non è stato implementato merge persistente, hydration, sync completa o aggiornamento UI. Nessun deploy verso Firebase né Rules live.


## Stato M2d — idratazione locale sicura
- `remoteReceipts` persistiti con `data` in un solo envelope IndexedDB; ripristino dopo reload e commit di nuovi eventi su piante remote.
- CAS e replay validante nel commit IDB; edit tra tab, revoca owner, receipt corrotti e conflitti portano a rifiuto senza perdere l'archivio precedente.
- Suite Firestore Emulator con due device: upload idempotente e lettura convergente su un sottoinsieme compatibile di operazioni.
- **Non attiva in UI/cloud live:** no checkpoint scalabile, tombstone, conflitti semantici, registrazione account, cancellazione sicura o Rules legacy riconciliate.


## Stato M2e — batch e conferme server
- Il ciclo di laboratorio combina lettura server, applicazione IDB atomica, upload max 20 intenti e riconferma server prima di avanzare.
- I batch successivi saltano soltanto i receipt **già verificati**; i timeout ambigui sono recuperabili senza deduplicazione cieca.
- I test Emulator coprono più di 20 operazioni reali; il codice **non** è attivo in UI, Hosting o Rules live. Mancano protocollo causale, scalabilità, account deletion e gestione conflitti utente.

## M3a — primo workflow botanico, con isolamento Auth
- Dopo grant Firebase Auth test-only valido (feature flag disabilitato di default), un modulo `PrivateGarden` monta il repository IndexedDB per lo specifico `user:uid`. La vista è rimossa subito quando decade l'autorizzazione.
- Funzionalità locali iniziali: aggiunta pianta e luogo, evento di diario, aggiornamento stato. La UI riflette il risultato solo dopo transazione durevole e segnala gli errori. Dati e cronologia pendente sono **private-only**.
- Non c'è bridge con CloudJournal e non esistono backup/export o vetrina; l'account-lifecycle e l'audit Rules live restano requisiti per apertura reale.

## Stato M3b — export/restore JSON privati
- L'utente di test autorizzato può esportare manualmente un file completo delle schede e del journal locale, con controllo di integrità SHA-256 (non autenticazione).
- Una importazione è verificata in anteprima e accettata soltanto su un archivio dello stesso UID completamente vuoto; salvataggio IDB atomico e quarantena del cloud.
- Nessuna cancellazione, merge automatico di altri dati, import legacy o distribuzione Firebase. I dati importati restano **local-only**.
