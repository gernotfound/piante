# Deploy e ambienti

## M0 — blocco di sicurezza
**NESSUN DEPLOY AUTOMATICO.** La CI può validare e produrre `dist/`, ma non ha `id-token: write`, credenziali GCP o permessi per modificare Firebase.

## Parametri target (da verificare nella Console)
- Project ID Firebase: `pianta-db`.
- Firebase Hosting site ID: `piante`.
- URL: `https://piante.web.app`.
- Piano desiderato: Spark.
- Il prodotto è nuovo, ma il progetto Firebase presenta ancora risorse del precedente client: inventario provider obbligatorio prima di deploy Rules, Auth, App Check, indici o pulizia.
- Vietato dichiarare convalidato lo stato live basandosi sui file repository.

## CI
La PR usa un check aggregato `Canonical Verification` che richiede lint, test, build, E2E e CodeQL sullo stesso SHA. Nessun job di PR riceve credenziali di deployment.

## Pipeline target successiva
1. PR su branch con test e review; merge su `main` solo dopo gate verde.
2. Reconciler Firestore (Rules/indici) sullo SHA verificato; verifica read-back live; non usare `--force`.
3. Hosting distribuito sullo stesso SHA dopo la fase Firestore.
4. Verifica HTTP, manifest, caching, autenticazione, navigazione e salvataggi.
5. WIF/OIDC con identità di deploy distinte e privilegi minimi; niente JSON service account.
6. Protezione GitHub del branch `main` con required check `Canonical Verification`.

Nel progetto di test esistente questa pipeline resta disabilitata fino al primo rilascio Piante approvato.

## Rollback
- Conservare SHA precedente, build e versione di Rules compatibile.
- Non usare il rollback frontend per cercare di invertire migrazioni Firestore distruttive.
- Per i futuri dati Piante, stendere un piano di migrazione/versionamento del **solo schema Piante** e backup verificati prima di cambi distruttivi.

## Vercel e Analytics
Nessuna integrazione Vercel o Google Analytics viene introdotta nel repository. La dismissione dell'eventuale sito Vercel Pianta è un task esterno separato, previa verifica del provider; Piante non usa Vercel.

## M2a — OAuth Piante e configurazione esterna ancora da verificare
Firebase Authentication usa il Project ID `pianta-db`, ma l'Auth helper e il dominio mostrato da Google devono puntare a `piante.web.app` tramite `VITE_FIREBASE_AUTH_DOMAIN=piante.web.app`.
Provider Google:
1. Verificare in Firebase Authentication > Settings > Authorized domains che sia incluso `piante.web.app`; la pulizia di altri domini è un task provider separato e verificato.
2. In Google Cloud > APIs & Services > Credentials, verificare il redirect del client OAuth utilizzato da Piante: `https://piante.web.app/__/auth/handler`; l'utente ne ha riferito l'aggiunta.
3. Confermare che `https://piante.web.app/__/auth/handler` venga servito realmente dal Firebase Hosting site `piante` prima di aprire il login.
4. Registrare e verificare l'App ID della web app Piante e fornire la configurazione Firebase Web pubblica nel sistema di build prima del deploy.
Queste operazioni sono esterne al repository: **non dichiararle completate senza verifica del provider**.
La schermata test resta disabilitata per default. Nessuna migrazione Firebase, distribuzione Rules, abilitazione utenti o deploy Hosting è previsto nella PR M2a.

## Registro dei servizi esterni e verifiche ricevute

Prima di modificare Firebase, Google Cloud o un altro provider consultare
[`external-services-register.md`](external-services-register.md)
e [la regola sulle integrazioni](../../.agents/rules/external-services.md).

**Checkpoint 2026-10-08, screenshot del product owner:** `piante.web.app` è mostrato come dominio Firebase Auth autorizzato e `https://piante.web.app/__/auth/handler` è mostrato tra i redirect OAuth. L'origine JavaScript `https://piante.web.app` **non** è nella lista visibile e resta da aggiungere. Lo stato storico è stato successivamente aggiornato dall'utente; il registro distingue gli screenshot iniziali da modifiche riferite e da letture API provider indipendenti.


## M3e — preflight non distruttivo delle release statiche
Da ora ogni build eseguita con `npm run build` applica `npm run check:release-boundary`; la configurazione Vite applica in aggiunta un controllo sul flag nel **mode effettivo**, anche con `vite build` diretto. Il flag `VITE_AUTH_TEST_MODE` assente o esplicitamente `false` è ammesso; un qualsiasi altro valore configurato blocca la build. Per la UI di laboratorio usare `npm run dev` con modalità test esplicita, non creare artefatti distributivi con login acceso.

`scripts/release-boundary.mjs` permette solo una configurazione Firebase **Hosting statico** (`site=piante`, `public=dist`, rewrite SPA invariata), un unico progetto predefinito `pianta-db`, header di sicurezza e **nessuna sezione** `firestore`, `storage`, `functions`, `database`, `extensions`, `emulators`. Le configurazioni env locali `.env`, `.env.local`, `.env.production`, `.env.production.local` vengono lette **senza stamparne il contenuto** per impedire accidentalmente flag test attivi. Il mode scelto da Vite è verificato da un secondo guard indipendente. Il guard viene testato con `npm run test:release-boundary` (test negativi) e dal nuovo job CI `Verification / Static Release Boundary`; la verifica aggregata `Canonical Verification` ora include questo job.

**Questo non è un comando deploy.** Non modifica Firebase e non prova le impostazioni provider attuali, né autorizza ad attivare OAuth, Auth o Rules. Niente segreti, ruoli, id-token, Service Account, upload di build o nuovo costo. Il prossimo deploy richiederà una decisione di release, la prova live dal provider, audit Rules effettive del provider, WIF/least privilege e smoke test dello SHA effettivamente pubblicato. Non sostituire la verifica provider con un successo CI.

**Nota cronologia OAuth:** la precedente sezione M2a riportava l'origine JavaScript `https://piante.web.app` come ancora da aggiungere sulla base dello screenshot iniziale. Il product owner ne ha poi **dichiarato l'aggiunta** (2026-10-08), come tracciato nel registro. Rimane **VERIFY-LIVE** per la verifica diretta provider e la prova runtime; non dedurre che OAuth sia funzionante dal codice.

## Primo rilascio Piante, senza migrazione da Pianta (decisione 2026-10-21)

Il product owner ha stabilito che **tutti i dati Piante saranno creati ex novo**. Nessun import di backup, dual-write, riadattamento dei modelli o cutover dati Pianta è previsto. Il progetto target resta `pianta-db` su Spark e il frontend previsto è `https://piante.web.app`; nessuna distribuzione è stata eseguita durante la pulizia della compatibilità.

Prima della prima attivazione: lettura provider di Auth/Firestore Rules/indici/IAM/OAuth/App Check, rimozione o isolamento **autorizzati** delle risorse vecchie, verifica di cancellazione account Piante, recovery cloud/offline, CI exact-SHA e smoke test. Non interpretare il diniego del namespace `users` nell'Emulator come modifica alle Rules già pubblicate: esse rimangono operative finché non vengono sostituite mediante una procedura live specifica.

L'eventuale sito Vercel Pianta è **da dismettere** ma non è usato dal nuovo prodotto: la chiusura effettiva va verificata sul provider e non deriva dalla cancellazione di fixture GitHub.
