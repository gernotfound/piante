# M4a — Prova di compatibilità Rules Pianta/Piante (SOLO Emulator)

## Provenienza e limite dell'evidenza

Il **2026-10-09** il product owner ha incollato in chat le Security Rules indicate come *attuali di Piante*, precisando che le Rules precedentemente condivise provenivano da **TheLogBook**. Il testo ora comunicato ha la struttura di Pianta legacy, che utilizza `/users/{uid}`, `plants`, `plants/{id}/logs`, `expenses`, `wishlist`, `images`. Lo snapshot versionato `gernotfound/pianta@acc510e2667bf3cbab8c576942a0f0de2df14ed2/firestore.rules` corrisponde a questo contratto ed è stato importato **senza modifiche** in `tests/fixtures/pianta-legacy-user-reported.rules`, identificato dal Git blob SHA `4953d4ca66305e4db39b38acbc8d738650b536e9`.

**Evidenza: `USER-REPORTED` per le Rules attuali; `GITHUB-OBSERVED` per lo snapshot storico nel repository legacy; NON `PROVIDER-OBSERVED`.** Non è stata effettuata una lettura live delle Rules effettivamente distribuite in `pianta-db`: non presumere equivalenza senza provider read-back e confronto della versione. Le Rules TheLogBook precedentemente inviate appartengono a un progetto distinto e non sono la baseline Firebase di Piante.

## Perché un semplice deploy sarebbe pericoloso

Le Rules di laboratorio `firestore.m2-test.rules` hanno namespace `piante_access` e `piante_users`, ma **non** autorizzano le letture/scritture Pianta sotto `users/{uid}`. Pubblicarle direttamente interromperebbe Pianta. Viceversa la baseline comunicata permette soltanto il namespace legacy: il nuovo login e il journal cloud Piante non funzionerebbero. La presenza di un `match /{document=**}` default-deny non è una protezione che annulla le altre regole: in Firestore i `allow` sovrapposti sono aggregati con OR, quindi un percorso specifico autorizzato rimane autorizzato.

## Strategia attuale: rehearsal isolato e additivo

1. `scripts/compose-compat-rules.mjs` legge due snapshot **pinned**: Pianta legacy e il fixture Piante M2. Verifica la Git blob SHA dei due sorgenti, quindi inserisce esclusivamente funzioni e match Piante nello stesso blocco `match /databases/{database}/documents`. Il frammento legacy è riproducibile byte-for-byte togliendo l'inserimento. Una modifica a qualunque snapshot blocca la generazione anziché adattarsi tacitamente.
2. `npm run test:rules:compat` esegue test Node strutturali e avvia un Firestore Emulator separato, progetto fittizio `demo-piante-test`, porta `8178`, con Rules composte in una directory temporanea. Non si connette a Firebase live, non usa segreti e cancella il fixture generato a fine prova.
3. `tests/compat/legacyCoexistence.test.ts` esercita permessi legacy root, esemplari, logs, spese, wishlist, immagini; casi validi e invalidi, owner/anonimo/cross-user e cancellazioni consentite. Esercita inoltre grant Piante, append-only journal, tombstone, nessuna self-provision e default-deny dei path sconosciuti. L'Emulator M2 isolato continua a essere testato con i suoi test originali.
4. Il job GitHub **Verification / Firestore Emulator** deve eseguire **ENTRAMBI** i set e quindi propagare il fallimento alla verifica canonica exact-SHA. Questo requisito impedisce di integrare regressioni compatibilità nel repository, **ma non misura la configurazione live**.

## Rischi preesistenti non modificati

- La baseline Pianta autorizza l'owner a eliminare `users/{uid}` e documenti figli, e autorizza create/update sul documento root owner senza allowlist. Inoltre ha controlli di schema variabili per sottocollezione (es. `plants` richiede campi, ma non `hasOnly`). Questo comportamento è **esistente**, va conservato nella prova e richiede una decisione/migrazione autorizzata se si vuole irrigidire la sicurezza legacy.
- Una suite positiva compatibile non prova semantiche di tutti i client reali, indici/query, Storage, documenti storici o costi Spark. Un audit provider deve includere Rules/versioni reali, IAM, App Check, Auth, indici, query legacy e piano di rollback.
- Il fixture Piante resta un modello **solo Emulator**, con validazioni e sottocollezioni da evolvere prima di un'eventuale release; il risultato della composizione **non è un pacchetto di deploy**, non compare in `firebase.json`.
- Non attivare sincronizzazione cloud, registrazioni o cancellazione account Piante sulla base dei soli test, e non cancellare utenti Firebase Auth condivisi.

## Stato e passi obbligatori prima di modificare Firebase

**M4a è prova in laboratorio, non release.** Per qualsiasi distribuzione futura: recuperare tramite provider competente le Rules live con metadati/versione, confrontarle con lo snapshot user-reported, fare inventario dei client e dati legacy, ottenere backup e piano reversibile autorizzato, aggiungere Rules Piante con allowlist su percorsi separati, testare su Emulator i client legacy e Piante, validare ogni required check SHA, predisporre una distribuzione isolata di sole Rules e monitorare rollback. Hosting resta separato e non viene modificato.
