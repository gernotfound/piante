# Dismissione Pianta → Piante — piano operativo e gate sui dati

> Decisione prodotto: **2026-10-21**, il product owner sceglie di dismettere la vecchia **Pianta** a favore di **Piante**. **Stato: DECIDED / NOT EXECUTED**. Classificazione **CRITICAL** (Firestore, Auth, Rules, backup, migrazione, PWA). Nessuna cancellazione, cambio provider, deploy o migrazione è avvenuta con questa decisione.
>
> Fonti distinte: `USER-REPORTED` (decisione, un account di test, provider Auth abilitati); `USER-SCREENSHOT` (Firestore console `(default)` regione `europe-west12`, collezione radice `users` visibile, sotto il documento mostrato `plants` e `images`); `GITHUB-OBSERVED` (codice e fixture dei due repository). **Non** sono `PROVIDER-OBSERVED`: manca accesso API alla configurazione live.

## Obiettivo e ambito

Pianta (repository `gernotfound/pianta`, documentata con frontend `https://pianta-gnf.vercel.app/`) verrà ritirata *dopo* aver garantito il recupero e, se richiesto, la migrazione dei dati nel nuovo prodotto. Piante rimane sul repository `gernotfound/piante`, target Firebase Project `pianta-db`, Hosting site `piante` e `https://piante.web.app`; Spark gratuito senza Blaze né Vercel per Piante.

La volontà di ritirare il **client** Pianta non autorizza da sola a eliminare dati, account Firebase Auth, collezioni, progetti Google Cloud, app registration, DNS/OAuth, repository o Vercel. Il product owner consente modifiche tecniche al database per sviluppare Piante, ma gli interventi devono soddisfare prerequisiti di inventario, backup e rollback; le eliminazioni irreversibili rimangono condizionate a consenso specifico. **Preservare ciò che esiste fino al superamento dei gate** e a una conferma specifica dell'eventuale eliminazione irreversibile. La nuova PWA non deve perdere lo stato offline, pubblicare note/foto/prezzi né riutilizzare automaticamente i dati dell'app legacy come schede pubbliche.

## Inventario osservato e incertezze

| Area | Evidenza verificata | Da verificare prima di scrivere |
| --- | --- | --- |
| Auth | Product owner riferisce **un account di test** ed entrambi i provider **Email/Password** e **Google** abilitati | Inventario Auth reale per metodo, UID, provider collegati, identità di altri client, MFA, sessioni, utenti nascosti, comportamento account deletion |
| Firestore | Screenshot console: database `(default)` in `europe-west12`; collezione radice `users` visibile e sottocollezioni `plants`, `images` nel documento selezionato | Elenco esaustivo radici/sottocollezioni e documenti, Rules versionate live, indici, quote, export affidabile e restore |
| Rules | Testo incollato nella chat di ottobre coincide con fixture byte-for-byte `tests/fixtures/pianta-legacy-user-reported.rules` (Git blob `4953d4ca66305e4db39b38acbc8d738650b536e9`) | Lettura **diretta da provider** delle Rules pubblicate e relativa versione; screenshot/testo non danno prova indipendente |
| Pianta dati | Codice legacy `users/{uid}/plants/{id}/logs`, `expenses`, `wishlist`, `images` e documento root; possono esserci preferenze/stato locale | Counts e contenuti **privati** da inventory sicuro, niente UID/payload in repository pubblico; eventuali documenti/sottocollezioni non previsti |
| Backup Pianta | `gernotfound/pianta/src/lib/backup.ts` implementa `schemaVersion: 3` con piante+diario, immagini, spese, wishlist e preferenza vento; export tramite UI | Prova di download, completezza rispetto a query provider (attenzione: parser legacy filtra documenti invalidi), checksum, custodia privata, prova ripristino su dati sintetici |
| Piante | IndexedDB locale+backup v1 differente; cloud e nuovo grant solo in Emulator, release flag Auth disabilitato | Conversione **versionata e testata** di schema, dedup, immagini, riferimenti, journal/recovery, import failure e rollback; mai incollare backup reali su GitHub |

Lo screenshot mostra anche il campo `expenses` **all'interno** del documento selezionato; non basta per dichiarare se la sottocollezione `expenses` esista o no. Una collezione `piante_*` non visibile nello screenshot non è dimostrata assente in tutto il database.

## Sequenza di esecuzione — gate vincolanti

### G0 — Congelare il rischio e stabilire la fonte live (read-only)
1. Recuperare dal provider l'inventario Auth, Firestore, Rules+versione, indici, IAM, App Check, Hosting e OAuth. Non dedurre l'assenza di altri account o collezioni dal singolo screenshot.
2. Identificare eventuali client attivi Pianta, installazioni PWA offline, tab aperte e scritture in corso; predisporre cutover con blocco delle **nuove** scritture legacy solamente al momento concordato e con rollback.
3. Nessuna modifica a `pianta-db` prima di queste verifiche. Il piano Spark non va cambiato automaticamente.

### G1 — Copia conservativa verificabile (prima di ogni atto distruttivo)
1. Effettuare backup completo *privato* dei dati Firestore legacy (compresi documento root e sotto-sottocollezioni), delle configurazioni/rules/indici necessari e del dataset locale non ancora sincronizzato, se presente; backup JSON UI Pianta v3 come copia aggiuntiva, **non** unica attestazione di completezza.
2. Documentare conteggi/manifest e fingerprint senza pubblicare contenuti, ID utente, foto o file backup. Verificare integrità e restaurabilità in ambiente **isolato con fixture sintetiche**; pianificare un rollback reale.
3. Non usare Firestore managed export a pagamento o Storage Blaze senza consenso. Se un backup completo non è tecnicamente possibile su Spark, **fermarsi**, non procedere con purge e non attestare sicurezza inesistente.
4. Conservare almeno una copia privata offline/accessibile al product owner prima di modificare le Rules o interrompere il vecchio client.

### G2 — Migrazione di sviluppo (reversibile)
1. Definire schema e mapping Pianta v3 → Piante con test: schede+parentela, diario e allegati, data/locale, immagini, spese, wishlist e preferenze. Mappare anche documenti fuori formato; mai saltarli silenziosamente.
2. Implementare import/readback in namespace `piante_*` isolato con versioni, idempotenza, dry-run/preview, quota Spark, journal/cas e recovery transazionale; testare su Emulator anonimi, cross-user, crash, abort, versioni inattese, doppio import e nessuna pubblicazione.
3. Fino a prova di convergenza, conservare le collezioni legacy e una via di ritorno; non forzare l'ack del journal dai digest client M5b.

### G3 — Cutover applicativo
1. Con prove provider e CI exact-SHA verdi, separare deploy Rules/indici (audit+rollback) da Firebase Hosting. Verificare Auth Email/Password e Google (inclusi account link, domini e callback) e la procedura di cancellazione account Piante.
2. Eseguire prova end-to-end sul nuovo account di test: login, modifica/refresh/offline, recupero, backup, import e ritiro pubblicazione; controllare quote e privacy.
3. Solo dopo esito positivo, indirizzare gli utenti dalla vecchia Pianta alla nuova PWA, ritirare la distribuzione Vercel legacy, gestire service worker/client offline e verificare che non possano continuare a scrivere silenziosamente.
4. Documentare SHA, configurazioni live e smoke test. La CI verde **non** equivale a runtime verificato.

### G4 — Dismissione dei residui (separata e specificamente autorizzata)
1. Dopo finestra di osservazione/rollback, valutare pulizia di `users/{uid}`, grant/Rules legacy, OAuth origini/redirect e sito Vercel. Non eliminare alcuna risorsa prima di inventario, backup restaurabile e autorizzazione specifica per l'elemento.
2. L'account test Firebase Auth può essere condiviso tra provider Google e password; mai cancellarlo per "ripulire Pianta" senza migrazione dell'identità e una procedura verificata di cancellazione Piante.
3. Il repository `gernotfound/pianta` resta archivio tecnico di riferimento fino a scelta esplicita; preferire archiviazione read-only a cancellazione Git irreversibile.
4. Ciascuna rimozione va annotata nel registro servizi con prova del provider, rollback praticabile e responsabilità/privacy.

## Prossima azione richiesta al product owner (non distruttiva)

Aprire la **vecchia Pianta** e usare **Opzioni → Dati e backup → Esporta backup**. Conservare il JSON `pianta-backup-…json` privatamente, **senza caricarlo nel repository pubblico o inviarlo in chat**. Comunicare solo se il download è riuscito e, se possibile, la dimensione approssimativa del file. Questa operazione è una **prima** copia, non la prova G1 completa. Non eliminare dati, account, OAuth origin o sito Vercel.
