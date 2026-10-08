# Deploy e ambienti

## M0 — blocco di sicurezza
**NESSUN DEPLOY AUTOMATICO.** La CI può validare e produrre `dist/`, ma non ha `id-token: write`, credenziali GCP o permessi per modificare Firebase.

## Parametri target (da verificare nella Console)
- Project ID Firebase: `pianta-db`.
- Firebase Hosting site ID: `piante`.
- URL: `https://piante.web.app`.
- Piano desiderato: Spark.
- Esistono app legacy che usano lo stesso Firebase Project: audit obbligatorio prima di deploy Rules, Auth, App Check, indici o migrazioni.
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

Nel progetto di test esistente questa pipeline resta disabilitata fino al cutover approvato.

## Rollback
- Conservare SHA precedente, build e versione di Rules compatibile.
- Non usare il rollback frontend per cercare di invertire migrazioni Firestore distruttive.
- Stendere un piano di migrazione/backfill e backup verificato prima di ogni cambio di schema.

## Vercel e Analytics
Nessuna integrazione Vercel o Google Analytics viene introdotta nel repository. Disabilitare eventuali collegamenti Vercel legacy nella relativa dashboard dopo verifica, non mediante modifiche cieche ad altri repository.
