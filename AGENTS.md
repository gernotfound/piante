# Piante — contratto operativo per agenti

Ambito: repository pubblico `gernotfound/piante`, **sito web** responsive, non PWA. I documenti operativi e la documentazione di configurazione vivono qui e in `.agents/rules/`, **non nel README**. Il README non va ricreato, riempito o usato come diario di progetto.

## Convenzioni
- **MUST**: vincolo di prodotto o di sicurezza.
- **VERIFY**: condizione da osservare in codice, test o provider prima di dichiararla vera.
- **NOTE**: informazione storica, non prova dello stato live.

Prima di intervenire: controllare l'HEAD di `main`, questo file, le regole pertinenti, il codice, i chiamanti, i test e il workflow. Se documentazione e runtime divergono, verificarli e correggere entrambi. Non modificare `gernotfound/logbook`: è un riferimento per le **convenzioni**, non una dipendenza né un archivio da importare.

## Quali regole leggere
- **Dati, pubblicazione, sicurezza Firestore:** [`.agents/rules/firestore-and-publication.md`](.agents/rules/firestore-and-publication.md).
- **Firebase, login Google, console/provider, accessi:** [`.agents/rules/firebase-services.md`](.agents/rules/firebase-services.md), poi [`docs/firebase-configurazione.md`](docs/firebase-configurazione.md).
- **UI responsive, foto e quote del piano gratuito:** [`.agents/rules/design-and-media.md`](.agents/rules/design-and-media.md), [`docs/design.md`](docs/design.md).
- **Test, branch, deploy, rollout e rollback:** [`.agents/rules/verification-and-release.md`](.agents/rules/verification-and-release.md).

Leggere l'unione dei documenti quando un task attraversa più confini. Non considerare i contratti una prova automatica della loro implementazione.

## Product scope
- **MUST:** sito web con homepage pubblica `/`, login Google `/login`, archivio privato `/app`, vetrina `/:username`, scheda `/:username/:plantSlug`.
- **MUST:** i tag sono creati dal proprietario, possono essere assegnati alle piante e sono usati come filtri pubblici *soltanto se pubblicati*.
- **MUST:** ogni pianta nasce privata; la vetrina e ogni singola proiezione pubblica richiedono opt-in. Nessun carrello, pagamento, prezzo o contatto pubblico automatico.
- **MUST:** nessuna PWA, Service Worker, manifest installabile, migrazione dati da `pianta`, integrazione Vercel o blocco offline-first.
- **SHOULD:** semplice HTML/CSS/ES modules con dipendenze limitate; mantenere layout accessibile su smartphone/desktop, tastiera, riduzione del movimento e immagini leggere.

## Sicurezza e dati
- **MUST:** `profiles/{uid}` è privato. `public_gardens/{username}` è una proiezione separata, composta solo dai campi esplicitamente condivisi; la visibilità è disattivabile senza cancellare dati.
- **MUST:** le scritture private/pubbliche correlate sono atomiche e soggette a Security Rules server-side. Non introdurre operazioni che creino una vista pubblica divergente.
- **MUST:** l'identificazione con Google non autorizza da sola a gestire dati: serve il grant amministrativo `access_grants/{uid}.enabled == true`. Il browser non può creare questi grant.
- **MUST:** dati, token, email, UID e segreti personali non vanno nei file di un repository pubblico.
- **MUST:** le nuove immagini sono caricate dal pannello, compresse in WebP a max 120 KiB, salvate in `plant_media/{username}/plants/{plantId}` in Firestore e protette da Rules. Letture pubbliche solo quando la vetrina è visibile e la singola foto è condivisa. I legacy asset in `web/images` o URL HTTPS esterni sono invece pubblicamente accessibili per URL, indipendentemente dalla scheda.
- **MUST:** non modificare o cancellare dati Firestore/Auth live, Rules live, origini OAuth, IAM, Hosting o servizi condivisi soltanto a seguito di un refactoring GitHub.
- **VERIFY:** le Rules versionate non sono necessariamente quelle distribuite. Firebase Auth, Firestore e Google OAuth live non sono stati collaudati durante l'implementazione della v1. L'auto-config Web stessa-origin da Firebase Hosting è **solo codice candidato**: finché non si verifica l'endpoint live non equivale a login funzionante.

## Operatività e verifica
- Classificare **CRITICAL** Auth, Rules, proiezioni pubblico/privato, media e dati utente. Verificare casi positivi/negativi, concorrenza, rollback e failure path.
- Usare branch dedicato, PR e controlli GitHub sull'esatto commit candidato, poi verificare `main` dopo il merge. Nessun bypass del controllo richiesto.
- I controlli locali e la CI Emulator/Chromium non dimostrano un deploy Firebase, l'OAuth live o l'assenza di regressioni in produzione.
- Il repository ha un `firebase.json` per Hosting statico. **Non** contiene una sezione Firestore: evitare il deploy automatico delle Rules candidate durante un futuro deploy Hosting.
- Per il rilascio servono inventario Firebase live, Web App config pubblica verificata, grant per l'account di test, audit Rules live, test browser reali con backend, piano di cancellazione account e autorizzazione per le modifiche esterne necessarie. Non attivare costi/Blaze.
- Documentare in `docs/firebase-configurazione.md` stato, data, evidenza e limiti di ogni verifica provider.

## Stato osservato al 24/10/2026
- **GITHUB-OBSERVED:** codice frontend statico e test Node, browser Chromium e Firestore Emulator in GitHub; il repository contiene codice e Rules candidate.
- **NOT-VERIFIED:** configurazione dell'app Web Firebase, OAuth reale, Rules attive, Hosting runtime e piano effettivo. `web/firebase-config.mjs` non ha ancora API key Web/App ID.
- Nessun account reale, dato o servizio Firebase è stato modificato per la preparazione di questa revisione.

## Riutilizzo selettivo da LogBook (24/10/2026)
Esaminati `src/lib/firebase.ts`, `src/contexts/auth/googlePopup.ts`, `src/contexts/auth/useGoogleAuthActions.ts`, `.agents/rules/firebase-config.md`, `.agents/rules/design-system.md`, workflow di deploy WIF e contract CI di `gernotfound/logbook`. Riutilizzati **i principi**, non importata la PWA: validazione di progetto/Origin prima di Firebase, fallback popup→redirect, cancellazioni e network error distinti, fences di sessione contro completamenti tardivi e verifiche CI. Vedi `.agents/rules/firebase-services.md`. Rifiutate come fuori scope architettura IndexedDB/offline, backend Vercel, guest migration e account deletion complessa senza un trusted backend Spark.

## Preflight Hosting in GitHub — fase di rilascio
- Il workflow manuale read-only `.github/workflows/hosting-readiness.yml` lancia `scripts/hosting-readiness.mjs` solo da `main`, senza token Firebase, e osserva soltanto HTML, CSP, modulo JS e il JSON Web Firebase pubblico sul dominio Piante.
- `npm run check:hosting` non distribuisce niente. FAIL prima del deploy significa soltanto che il sito pubblico non è verificato; PASS non certifica Auth/Firestore live.
- Checklist per audit Console, rollback e Hosting-only deploy: `docs/operations/firebase-release.md`. Non inserire segreti o UID in questi documenti.
- Bugfix UI: i filtri/ricerca non vanno azzerati dai rerender di stato; si azzerano quando cambia la rotta.

## Foto dall'account — nuovo contratto (24/10/2026)
- Una foto ottimizzata per pianta nella prima implementazione; il salvataggio avviene direttamente dal browser nel documento binario Firestore, **non** nel repository GitHub e **non** in Firebase Storage.
- Compressione senza EXIF con canvas WebP: lato max 1080 px, byte massimi 122880. Dimensione/codifica sono ricontrollate dalle Rules; immagini più grandi o formati non ammessi vengono rifiutati.
- Pianta e media vengono sincronizzate in batch; vetrina pubblica, scheda e campo condiviso `imageStored` governano la lettura anonima. Nel pannello privato la foto è consultabile solo dall'account con grant. Test su Emulator obbligatorio prima del deploy Rules.
- Firestore Spark: **1 GiB archivio, 50.000 letture/giorno, 10 GiB trasferiti/mese** nell'unico DB gratuito; immagini pesanti o tanti visitatori possono esaurire la quota senza diventare un servizio Storage gratuito illimitato.
- Il codice in GitHub non significa che le nuove Rules siano live. Nessuna modifica a provider e nessun deploy autorizzato da solo.

## Firebase Rules: deploy governato da GitHub (preparazione 24/10/2026)
- Il file principale `firebase.json` rimane **Hosting-only**. Il workflow **manuale** `.github/workflows/firebase-firestore-rules.yml` usa `firebase.rules-deploy.json` per pubblicare esclusivamente `firestore.rules`, mai Hosting o indici. Non eseguirlo senza autorizzazione alla sostituzione completa delle Rules live.
- L'audit usa Firebase Rules REST + WIF Google Cloud e stampa il ruleset live e la sua identità. Il deploy richiede explicit `DEPLOY_PIANTA_DB_RULES`, expected live ruleset esatto e, se il nuovo schema revoca `/users`, `RETIRE_LEGACY_USERS_ACCESS` in un altro input. Richiede CI verde exact SHA, Emulator, controllo anti-drift e read-back post-deploy.
- Snapshot del ruleset **fornito dall'utente** (non letto dal provider) in `docs/operations/firestore-rules-legacy-20261024.rules`. I `users/{uid}` esistenti non sono migrati; sostituire le Rules può bloccare il sito precedente ma non elimina dati. Il cutover va coordinato con Hosting/Auth/grant.
- Servono un nuovo WIF provider/account IAM su **pianta-db** separati da LogBook, variabili GitHub e protezione dell'environment `firestore-production`. Nessun ruolo o account live è stato creato dal repository.
- Procedure e variabili esatte in `docs/operations/firestore-rules-github-deploy.md`. Non ricreare un README.
