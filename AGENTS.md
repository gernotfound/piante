# Piante — contratto operativo per agenti

## Fonti di verità
- **Servizi esterni:** leggere `.agents/rules/external-services.md` e `docs/operations/external-services-register.md` quando un task riguarda iscrizioni, domini, provider, autenticazione, credenziali, deploy, costi o configurazione esterna. Aggiornare il registro nello stesso task dopo ogni modifica materiale; distinguere screenshot, stato del repository e provider effettivamente verificato.


- Verificare HEAD reale di `gernotfound/piante` prima di qualsiasi modifica.
- Consultare `gernotfound/logbook` per principi, non copiare automaticamente implementazioni o versioni di protocolli.
- Consultare `gernotfound/pianta` soltanto per inventario funzionale e migrazione dei dati legacy.
- Non dichiarare eseguiti test, deployment o verifiche mai osservati.
- Ogni modifica a contratti o pipeline aggiorna anche i documenti normativi pertinenti.

## Vincoli non negoziabili
- Solo servizi compatibili con Firebase Spark, GitHub Free e hosting statico; nessun servizio a pagamento introdotto implicitamente.
- Firebase target di test `pianta-db`, Hosting site `piante`; **contiene dati legacy da preservare**.
- Niente Vercel, Firebase Analytics/GA4, token o credenziali amministrative nel client/repository.
- Non usare Firestore o Firebase Authentication nella shell M0; Firebase deve rimanere inattivo fino a una milestone approvata.
- Non distribuire Rules o modificare i dati esistenti nel corso di M0.
- Branch dedicati e PR prima delle integrazioni in `main`.
- Mai dichiarare una PR approvata o una CI verde soltanto perché il codice compila localmente.

## Dati e privacy
- Ogni account possiede soltanto i propri dati privati; modelli privati e pubblici sono fisicamente distinti.
- Pubblicazione esplicita con allowlist versionata di campi, mai esposizione diretta dell'intero documento privato.
- Media pubblici fisicamente distinti dalle immagini private e sanificati da metadati sensibili.
- Nessun prezzo, venditore, coordinata precisa o nota personale pubblicato per default.
- Firestore Rules default-deny; suite Emulator per possesso, accesso anonimo, cross-user e operazioni vietate.
- Schemi persistiti versionati e validati a runtime; versioni future sconosciute bloccano le scritture.
- Backup/import completi e testati prima delle migrazioni distruttive.
- Nessun account multiutente aperto prima di una soluzione comprovata per cancellazione e cleanup senza orfani.

## Offline-first
- Stato UI in Zustand; archivio durevole locale in IndexedDB; Firestore come replica cloud.
- Un solo proprietario autorevole per la persistenza offline; non creare una seconda cache persistente Firestore non gestita.
- Operazioni business serializzabili, journal locale atomico, replay deterministico e conflitti gestiti senza perdita dati.
- Errore di persistenza critica = errore osservabile, non un successo silenzioso.
- Pubblicazione online solo dopo conferma cloud; modifiche offline possono restare pending.
- Nessun Service Worker update che possa cancellare uno stato locale non persistito.

## Workflow
1. Inquadrare il task e il rischio: standard, sensitive o critical.
2. Analizzare implementazione, chiamanti, test, modelli e configurazione.
3. Preparare un piano reversibile per dati, auth, sync, backup, pubblicazioni, Rules e deployment.
4. Implementare su branch dedicato con test di regressione.
5. Eseguire i controlli locali disponibili e il gate GitHub sullo SHA candidato.
6. Solo dopo verifiche e revisione, valutare merge, sincronizzazione dei Rules e Hosting.

## M0
- M0 crea esclusivamente una shell presentazionale, routing, design tokens, manifest e pipeline CI.
- Non esistono ancora login, scritture Firestore, pubblicazioni attive o API trusted.
- Il gate canonico è `Canonical Verification`: lint, unit test, build, E2E e CodeQL.
- Nessun job M0 ha permessi/secret per deploy verso Firebase.
- La branch protection di `main` deve richiedere il check canonico prima di abilitare future release.


## M1 — modulo botanico e storage locale
- `src/domain/schema.ts` è il contratto Zod private-only: identità stabili, dati di calendario, relazioni senza cicli, luoghi e diario. Nessun campo pubblico deriva implicitamente dal modello privato.
- `src/domain/operations.ts` applica intenti tipizzati e valida lo stato risultante. Patch: chiave assente = invariata, `null` = cancellazione di campo opzionale, `undefined` = errore.
- `src/storage/localRepository.ts` è la sola sorgente durevole del nuovo modulo M1: un record IndexedDB per owner contiene stato, sequence e journal nella **stessa transazione readwrite**. La read-modify-write deve restare atomica anche tra schede.
- Errori IndexedDB, schema/versione futura incompatibile, ID duplicati e riferimenti invalidi **falliscono chiusi**: non ricreare silenziosamente lo stato vuoto.
- Acknowledge del journal permesso solo dopo conferma remota autorevole: M1 NON ha un adattatore cloud. L'ack di un prefisso non deve rimuovere operazioni più recenti o sovrascrivere lo stato business.
- Owner scope valido: `user:<uid>` o `guest:<id>`. In M1 il modulo non viene chiamato dall'interfaccia: Auth, session lifecycle e isolamento effettivo utenti saranno implementati e testati prima di abilitarlo in UI.
- Le versioni `LOCAL_ENVELOPE_VERSION=1` e `LOCAL_DATA_SCHEMA_VERSION=1` sono proprie di Piante, non versioni TheLogBook.
- I dati Firebase legacy sono fuori perimetro; nessun nuovo listener, scrittura cloud o deploy Rules/Hosting in M1.

## M2a — dominio OAuth e Rules di laboratorio
- Google OAuth della nuova Piante deve usare `authDomain=piante.web.app` e Project ID `pianta-db`. Non modificare la configurazione dei client Pianta legacy.
- Il modulo Auth viene importato soltanto se `VITE_AUTH_TEST_MODE=true`; valore predefinito **false**. Questa protezione UI non impedisce la creazione di account Firebase Auth da accessi Google: l'apertura generale resta vietata.
- Il controller Auth blocca la sessione fino al grant positivo `piante_access/{uid}.enabled===true`. Gli epoch di sessione invalidano i grant asincroni obsoleti. Nessun dato privato viene caricato in M2a.
- `firestore.m2-test.rules` è un fixture per **Firebase Emulator soltanto**; NON è incluso in `firebase.json`. Contiene un default-deny intenzionale che interromperebbe il legacy se distribuito.
- `npm run test:rules` è un required gate CI con Emulator, Java e checksum del JAR. Non sostituirlo con test mock o statici.
- Le Rules live devono essere lette dal provider e riconciliate con il legacy prima di distribuire qualsiasi versione.
- M2b deve implementare e testare le scritture cloud, la sincronizzazione/recovery e la cancellazione prima dell'apertura degli account.

## M2b — append-only cloud transport di laboratorio
- Prima di toccare `src/cloud/*` o le Rules leggere `.agents/rules/cloud-journal.md`.
- Trasporto Firestore testato solo contro Emulator: nessuna connessione runtime, nessun deploy sul progetto condiviso.
- Idempotenza basata su operationId/payload, owner+grant lato Rules, collisioni vietate, nessuna rimozione del journal in M2b.
- `uploaded-awaiting-reconciliation` non significa sincronizzazione completa. Hydration e account deletion restano future milestone CRITICAL.


## M2c — anteprima di riconciliazione cloud (read-only)
- `src/cloud/reconciliationPreview.ts` ricostruisce una **anteprima**, NON salva né conferma operazioni o riscrive lo snapshot. È necessario un protocollo causale e un boundary IDB atomico prima di una hydration effettiva.
- Verificare con `getDocsFromServer` una scansione completa bounded; documenti sopra il limite, sequenze mancanti, dati malformati e collisioni impediscono la ricostruzione.
- Verificare lo stesso owner e lo stesso epoch Auth prima/dopo la lettura; una modifica IDB concorrente rende obsoleto il risultato.
- Non usare timestamp muro come arbitrato LWW: sovrascritture dello stesso campo da repliche diverse bloccano l'anteprima, non si risolvono silenziosamente.
- Il journal locale rimane durevole e pending; la nuova API resta non collegata all'interfaccia. Suite Emulator obbligatoria. Nessun deploy Firebase/Rules per M2c.


## M2d — hydration persistente e fallimento chiuso
- `src/cloud/hydration.ts` salva la proiezione cloud validata e tutti i receipt remoti in un **solo record/transaction IndexedDB** con CAS completo contro modifiche locali simultanee. Prima e dentro la transazione ripete la verifica.
- `remoteReceipts` è un'estensione additiva e retrocompatibile del contratto M1 v1: lettura di vecchi envelope senza tale campo = array vuoto. Nessun dato precedente è eliminato automaticamente.
- La verifica locale usa `remoteReceipts + pending` per controllare che `data` sia ricostruibile; se un vecchio acknowledge ha perso storia senza una baseline/cloud receipt corrispondente, bloccare invece di azzerare.
- Receipt server mancanti, corrotti o cambiati tra scansioni, scope sbagliato, edit concorrenti o conflitti tra device bloccano hydration preservando lo stato IDB. Nessun overwrite silenzioso.
- Testare runtime di due client reali con Emulator, recovery offline dopo riavvio, fallimenti IndexedDB, logout/revoca, collisioni e storie incomplete.
- Lo stato è **una convergenza limitata di laboratorio**, non un protocollo completo con checkpoint, deletion/tombstone, GC, gestione conflitti semantici, account deletion o registrazioni libere.
- **NON collegare alla UI né distribuire su pianta-db** finché Security Rules live legacy, IAM, recovery end-to-end e cancellazione account non sono sottoposti a audit e test.


## M2e — ciclo sincrono batch del journal (laboratorio)
- `runPrivateJournalCycle` compone hydration server-verificata → upload max 20 operazioni → nuova hydration e verifica receipt; max 200 receipt per device in laboratorio. Non è un worker in background né una sync multiutente attiva.
- Le pending **non sono mai eliminate**: una conferma può soltanto diventare `remote-receipts-already-present` dopo che una scansione server autenticata è stata persistita nell'envelope.
- Ogni errore, timeout, autorizzazione revocata o conferma cloud mancante deve produrre stato distinguibile (`retry-required`, `blocked` oppure eccezione fail-closed), senza riportare «sincronizzato» impropriamente.
- Rileggere il cloud **prima** di caricare nuovi intenti; divergenze semantiche fra repliche bloccano l'upload e preservano journal locale.
- **Non collegare all'UI, non abilitare Rules live e non distribuire su pianta-db.** Account lifecycle, protocollo causale e checkpoint restano obbligatori prima dell'uso.

## M3a — archivio UI privato riservato (test-only)
- `src/private/PrivateGarden.tsx` può leggere e scrivere **solo IndexedDB** dopo `AuthSessionController.status==='authorized'`, e **solo quando `VITE_AUTH_TEST_MODE=true`**. Di default la PWA rimane la shell.
- Non consentire la gestione dati a sessioni initializing/checking/denied/signed-out/error. Ogni cambio UID deve smontare la vecchia istanza e crearne una per `user:<uid>`; vietati guest fallback e cache condivise.
- Usare `LocalGardenRepository.commit()` per ogni modifica: visualizzare conferma soltanto dopo `tx.oncomplete`. Gli errori di schema/storage rimangono errori visibili; non simulare successo.
- Conservare lo stato privato, i pending e le note nel solo record IDB, senza servizi terzi, analytics o cloud. Nessuna vetrina pubblica è alimentata da questo componente.
- Mostrare avviso esplicito: dati locali **non sincronizzati e senza backup live**; si possono perdere cancellando dati browser. Non incoraggiare uso produttivo finché export/backup e recupero reali non sono disponibili.
- Proibito collegare in UI `runPrivateJournalCycle`, `hydratePrivateJournal` o Firestore prima dell'audit live Security Rules legacy, account lifecycle e cancellazione.
- Verificare a ogni modifica il gate Canonical, più regressioni form validation, isolamento UID, failure path IDB e PWA/routing.

## M3b — backup JSON e recupero solo su archivio vuoto
- Leggere `.agents/rules/backup-and-recovery.md` prima di export/import o modifiche a IDB/cloud che influiscono sui backup.
- Il backup JSON include **tutto** l'envelope locale e il journal, non soltanto schede UI; il file contiene dati privati in chiaro, non è una firma o un backup online.
- Valutare versione/schema, checksum SHA-256 e replay integrale prima di un'importazione; anteprima separata e conferma esplicita.
- Ripristinare **esclusivamente su un archivio vuoto dello stesso UID**, in una transazione IDB, con controllo autorizzazione.
- `backupQuarantined=true` blocca upload/hydration Firestore dopo import, perché i vecchi `replicaId` potrebbero esistere su altri device; una migrazione futura dovrà risolvere il rekey causale.
- Vietate sovrascritture distruttive automatiche, import legacy Pianta non autorizzati e distribuzione Rules/Hosting in questa milestone.


## M3c — preflight e barriera di cancellazione, SOLO Emulator
- Consultare `.agents/rules/account-lifecycle.md` e le regole cloud/esterni prima di toccare account, cleanup o Rules. Studiare i contratti correnti di LogBook come principi, **non** trasferirne i provider o protocolli.
- Firebase Auth nel progetto `pianta-db` può essere condiviso con la vecchia Pianta: non eliminare mai utenti Auth o dati `users/{uid}` legacy.
- `src/account/deletionRunner.ts` è codice di laboratorio indipendente dal client e **non collegato ad alcun backend live**. Richiede un futuro provider trusted e un tombstone `piante_account_deletions/{uid}` atomico e amministrativo con lease.
- Prima di ogni cleanup controllare completezza di tutte le risorse associate, incluse proiezioni pubbliche e Storage; bloccare collezioni private sconosciute. Batch <= 50, retry idempotenti, verifica vuoto e grant Piante cancellato **prima** del complete; nessuna eliminazione Auth.
- Le Rules di laboratorio bloccano il grant e ogni documento privato Piante dopo tombstone. Mai distribuire il fixture su Firebase condiviso senza audit legacy e backend autorizzato.
- Nessun purge IndexedDB soltanto perché Auth non esiste o un client è offline; servono conferma server effettiva e recovery device sicuro.
- Nessuna UI "Elimina account" o apertura delle registrazioni fino a lifecycle end-to-end funzionante e decisione sull'identità condivisa.


## M3d — lease fencing della cancellazione (laboratorio)
- `TrustedDeletionPort.begin()` restituisce un lease token server-issued non riutilizzato. Il runner chiama `assertLease(uid,token)` dopo le letture asincrone e prima di ogni azione distruttiva.
- **MUST:** `deleteDocuments`, `deletePrivateRoot`, `deleteGrant` e `markComplete` controllano **atomicamente** la validità del token/lease dentro la stessa operazione server del side effect; il solo precheck non elimina il race TOCTOU.
- **MUST:** `release(uid,token)` non può mai rilasciare il lease di un worker più recente; tombstone persistente anche in errore/scadenza. Il runner non deve interpretare la perdita del lease come completamento.
- Un job già `complete` verifica nuovamente inventario esterno, namespace Piante vuoto e grant rimosso. Anche il path iniziale verso `markComplete` riesamina gli artifact esterni.
- Nessuna implementazione live del port è presente: questo è un contratto testabile in memoria. **NON** distribuire né collegare alla PWA prima di backend trusted, audit Firebase live e prova di atomicità end-to-end.


## M3e — static release safety gate (STANDARD per CI, CRITICAL per confini Firebase)
- Leggere `.agents/rules/release-boundary.md` prima di modificare `firebase.json`, `.firebaserc`, variabili `VITE_AUTH_TEST_MODE`, `vite.config.ts`, build, CI o deploy.
- L'artefatto `npm run build` è **solo una shell statica**: `scripts/check-release-boundary.mjs` e Vite rifiutano build se `VITE_AUTH_TEST_MODE` non è disabilitato. Non riattivare login sperimentale in una release normale.
- Il controllo vieta nuovi blocchi Firebase `firestore`, `functions`, `storage` e altri provider nel file Hosting, site/progetto inattesi, riscritture diverse dalla SPA e rimozione degli header di sicurezza.
- `Verification / Static Release Boundary` esegue invarianti + preflight sullo **SHA esatto**, e `Canonical Verification` ne richiede il successo insieme agli altri gate.
- Questi controlli provano **solo configurazione statica GitHub**, non Firebase live. La CI non dispone di credenziali e non distribuisce niente. La riconciliazione delle Rules legacy, IAM, OAuth/App Check e lifecycle account restano vincoli prima dell'attivazione.


## M3f — invalidazione live del grant Auth per l'area privata di laboratorio
- `AuthSessionController` ascolta `onIdTokenChanged` e **un listener Firestore server-verificato continuo** per `piante_access/{uid}`: `onSnapshot` con `includeMetadataChanges` e `snapshot.metadata.fromCache===false` è requisito per `authorized`.
- Ogni callback cached/offline `null`, revoca `enabled=false`, token/UID cambiato, listener error, logout o sessione non verificabile **smonta subito** `PrivateGarden`; fino a successiva conferma server la UI privata non deve riapparire. Epoch/generation fence per callback obsoleti. Esplicito logout blocca l'Auth callback residuo fino a nuovo signIn.
- Segnali browser `offline` e ritorno foreground/online provocano fail-closed e nuovo grant server; **non** interpretare assenza di evento come prova che la rete sia attiva. Le Rules effettive restano l'unico enforcement cloud.
- Sessione revocata deve bloccare `LocalGardenRepository.commit()` anche tra richiesta e transazione; i dati già persistiti in IndexedDB **non** sono cifrati né eliminati. Un browser fisicamente condiviso necessita ulteriori controlli: la UI non protegge contro accesso al profilo browser/devtools.
- Il listener aumenta letture Firestore per account test: il flag `VITE_AUTH_TEST_MODE=false` e il gate M3e restano obbligatori. **Non attivare registrazioni, grant o Rules live** finché il ciclo account non è completo.
