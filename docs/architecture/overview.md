# Architettura — Piante

## Confini

| Contesto | Responsabilità |
| --- | --- |
| UI | Stato di navigazione, presentazione e accessibilità |
| Dominio | Esemplari botanici, propagazione, diario, luoghi, cure, pubblicazione |
| Repository locale | IndexedDB owner-scoped e journal di operazioni durevoli |
| Replica cloud | Firestore con validazione, evoluzioni versionate **native Piante** e retry |
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

Il prefisso `piante_*` è il **namespace nativo, nuovo e isolato di Piante**, non un ponte di migrazione da Pianta. Non leggere né importare `users/{uid}`; i documenti ancora presenti sul provider richiedono pulizia esterna separata.

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
- **Non attiva in UI/cloud live:** no checkpoint scalabile, tombstone, conflitti semantici, registrazione account, cancellazione sicura o Rules live auditabili.


## Stato M2e — batch e conferme server
- Il ciclo di laboratorio combina lettura server, applicazione IDB atomica, upload max 20 intenti e riconferma server prima di avanzare.
- I batch successivi saltano soltanto i receipt **già verificati**; i timeout ambigui sono recuperabili senza deduplicazione cieca.
- I test Emulator coprono più di 20 operazioni reali; il codice **non** è attivo in UI, Hosting o Rules live. Mancano protocollo causale, scalabilità, account deletion e gestione conflitti utente.

## M8d — storico del diario navigabile
Nella sola UI privata di prova si può consultare tutta la cronologia IndexedDB, non soltanto gli ultimi otto eventi. I dati sono già nel record owner-scoped: vengono ordinati per data evento decrescente, `createdAt` e ID per spareggi deterministici; poi filtrati in memoria per ID esemplare e attività, con pagine da **10 eventi** e navigazione accessibile. Il filtraggio non modifica envelope, revision, pending, backup o Firestore, e non rende pubbliche note o misurazioni.

## M8c — diario botanico con quantità
Nel prototipo locale, l'evento `measurement` consente altezza in **centimetri** e pH del terreno; `harvest` consente la massa raccolta in **grammi**. Gli altri tipi non scrivono dati numerici accidentali. Il dominio Piante li valida già come campi opzionali di `event.add` in un unico journal IndexedDB; l'interfaccia ora li espone, li visualizza con unità, li rilegge dopo reload e rifiuta valori fuori intervallo o edit di una revisione obsoleta. Nessuna migrazione schema, Rules, backup o servizio Firebase live.

## M8b — luoghi modificabili senza rinumerare le piante
L'archivio privato di prova elenca i luoghi e permette di aggiornare nome, categoria (balcone/giardino/interno/serra/altro) e note. Una `place.patch` entra nel journal IndexedDB durevole solo dopo un controllo CAS sulla `revision` acquisita all'apertura dell'editor. ID del luogo, coordinate eventuali e riferimenti `plant.placeId` restano invariati; una seconda scheda con una modifica più recente blocca il form obsoleto e richiede riapertura. Il nuovo workflow è **solo locale e test-only** e non pubblica coordinate o note.

## M3a — primo workflow botanico, con isolamento Auth
- Dopo grant Firebase Auth test-only valido (feature flag disabilitato di default), un modulo `PrivateGarden` monta il repository IndexedDB per lo specifico `user:uid`. La vista è rimossa subito quando decade l'autorizzazione.
- Funzionalità locali iniziali: aggiunta pianta e luogo, evento di diario, aggiornamento stato. La UI riflette il risultato solo dopo transazione durevole e segnala gli errori. Dati e cronologia pendente sono **private-only**.
- Non c'è bridge con CloudJournal e non esistono backup/export o vetrina; l'account-lifecycle e l'audit Rules live restano requisiti per apertura reale.

## Stato M3b — export/restore JSON privati
- L'utente di test autorizzato può esportare manualmente un file completo delle schede e del journal locale, con controllo di integrità SHA-256 (non autenticazione).
- Una importazione è verificata in anteprima e accettata soltanto su un archivio dello stesso UID completamente vuoto; salvataggio IDB atomico e quarantena del cloud.
- Nessuna cancellazione, merge di dati estranei o distribuzione Firebase. Il backup di recupero riguarda esclusivamente l'archivio generato da Piante.


## M3c — percorso trusted di cancellazione preparato (non operativo)
- Contratto del runner server-only per **solo** dati Piante: tombstone amministrativo, lease, inventory di collezioni e asset, batch massimo 50, stato riprendibile e verifica finale.
- Rules e regressioni Firestore Emulator negano tutti i path Piante (incluso grant) quando compare tombstone, senza esporre o mutare il job dal client.
- L'account Firebase Auth **non** viene cancellato: il runner di laboratorio Piante non gestisce ancora identità. Non esiste backend live né UI di cancellazione. Le Rules di prova non sono quelle distribuite. Non aprire signup né dichiarare lifecycle completo.


## Stato M3d — hardening lease amministrativi
- Verificato HEAD e CI precedenti su GitHub, poi rafforzata la barriera di cancellazione con token di fencing e regressioni sui race TOCTOU fra scan e delete.
- Il contratto richiede validazione atomica del lease dentro i mutatori server, rilascio condizionale e nuova verifica degli artifact esterni prima del completamento.
- **Non implementato:** adapter Firebase Admin reale, endpoint, cancellazione/Auth lifecycle, deploy Rules/Hosting o cleanup delle risorse preesistenti. La validazione provider live è ancora aperta.


## Stato M3e — rilascio Hosting statico protetto da CI
- Testa separatamente configurazioni di deploy pericolose, project/site target e flag `VITE_AUTH_TEST_MODE` prima di compilare `dist/`.
- Il job `Verification / Static Release Boundary` è parte integrante di `Canonical Verification` e legge configurazioni senza secret; la configurazione Vite rifiuta anche build invocate senza npm prebuild se il flag test è attivo.
- **Non configurato né verificato:** provider IAM/OAuth/App Check/Rules live, backend trusted/cancellazione, credenziali WIF, deploy Hosting e smoke test sul sito; quindi nessun rilascio pubblico autorizzato.


## Stato M3f — listener di autorizzazione privata a prova di cache
- Il controller Auth di laboratorio usa `onIdTokenChanged` e il nuovo `watchServerGrant`; lo stato authorized richiede la conferma Firestore con `fromCache=false`.
- Cache/assenza di prova, revoca grant/tombstone, identity switch, token refresh, logout, errore listener e segnali offline chiudono l'area privata; la riconnessione richiede un'altra conferma server.
- Suite unit e Firestore Emulator verificano revoca live, stato deny, tombstone e gate di scrittura IndexedDB. **Nessun deploy** e flag test OFF in produzione; impatto letture Firestore da auditare prima dell'attivazione.


## Piante greenfield — decisione 2026-10-21
- Non esiste alcuna migrazione dal precedente prodotto Pianta: nessun import, adattamento, coesistenza o backfill.
- Rimossi il vecchio harness di composizione Rules e la suite di compatibilità legacy. I test Firestore Emulator **Piante** e il default-deny su `users/{uid}` rimangono nel gate Canonical.
- Le Rules live del provider e la presenza di dati o account precedenti richiedono verifica separata: una pulizia del codice non cancella risorse reali. Il nuovo prodotto resta in fase di laboratorio finché non completa causalità/recovery, account deletion e audit Firebase.
