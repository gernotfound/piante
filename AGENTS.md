# Piante — contratto operativo per agenti

## Fonti di verità
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
