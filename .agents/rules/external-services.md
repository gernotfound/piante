# Servizi esterni, IAM e segreti

**Quando leggere:** configurazione Google Cloud/Firebase, GitHub, Authentication, Hosting, IAM, costi, domini e nuove integrazioni.

**Autorità:** [AGENTS.md](../../AGENTS.md). Questa regola specializza quel file; non amplia il mandato.

## Contratto operativo

- MUST: distinguere stato dichiarato dal proprietario, configurazione GitHub e riscontro live nel provider. Nessuno dei tre prova automaticamente gli altri.
- MUST: ogni cambiamento di provider aggiornare il [registro operativo](../../docs/operations/external-services-register.md), con data, fonte e stato, senza esporre credenziali.
- MUST: trattare il repository come pubblico. Non inserire chiavi JSON, private key, token, sessioni, password, UID Firebase reali o email personali in Git, issue, PR o log non necessari.
- MUST: usare un'identità GitHub→GCP dedicata a Hosting, senza Firebase Admin generalista. Il service account può ricevere `roles/firebasehosting.admin`, `roles/serviceusage.apiKeysViewer` e `roles/serviceusage.serviceUsageViewer` (lettura stato API richiesta dalla Firebase CLI); non ruoli di Firestore, Storage o Authentication per il semplice deploy live.
- SHOULD: configurare GitHub con Workload Identity Federation (GitHub OIDC), senza secret di lunga durata. Il provider deve limitare l'impersonazione all'identità immutabile del repository `gernotfound/piante` e al ref `refs/heads/main`; l'account deve concedere `roles/iam.workloadIdentityUser` al principal appropriato, non all'intero pool indistinto.
- MUST: non creare chiavi di servizio senza necessità verificata e approvazione; le variabili GitHub per WIF contengono identificativi non segreti.
- MUST: non cambiare il piano Spark in Blaze, non attivare API a pagamento o nuovi servizi senza autorizzazione specifica.
- MUST: usare `firebase.json` + `.firebaserc` per destinare il deploy solo al site ID `piantee`; un project ID `piante-a617e` non equivale al site ID.
- MUST: proteggere `main` con PR e verifica `Canonical Verification` dopo attivazione e conferma del ruleset nel provider; gli workflow non sostituiscono un ruleset GitHub.
- MUST: distinguere le `apiKey` pubbliche della Web App Firebase (restrizioni API necessarie) dalle credenziali private di amministrazione. Non ruotare automaticamente una chiave Firebase client a causa di un alert di pattern, né sopprimere secret scanning per `src/config.js`.
- MUST: il job Hosting pubblica soltanto Hosting, dopo il successo di un job Firestore Rules separato. Quest'ultimo usa un distinto account WIF con `roles/firebaserules.admin` (nessun permesso di lettura/scrittura sui dati o di gestione degli indici) e pubblica solo le Security Rules del database `(default)` con API ufficiale. Controlla SHA, drift live, release finale e propagazione prima di sbloccare Hosting. Non assegnare privilegi Rules al deployer Hosting.
- MUST: non creare nuove identità, concedere IAM o attivare API senza mandato; questo flusso richiede la variabile non segreta GitHub `GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT`. Nessuna chiave JSON. L'emulatore Firestore prova il candidato, non il runtime.
- VERIFY: controllare direttamente nel provider il ruolo IAM, il dominio autorizzato, la presenza del sito, le impostazioni Auth/Firestore e la quota quando queste influenzano un rilascio.

## Failure e ripristino

- Credenziali WIF non provisionate: fallire prima del deploy; non usare token personali o chiavi copiate nel codice come fallback.
- CI rossa o HEAD main cambiato: non distribuire un commit non verificato o obsoleto.
- Deploy Hosting riuscito ma login/catalogo falliscono: distinguere Auth, Rules, Firestore, rete e browser; non aprire le Rules per far passare il client.
- Per rollback usare le release Firebase Hosting dopo aver identificato la versione corretta. Il rollback Hosting non riscrive dati, Rules o configurazioni Auth.
- Correggere ogni fuga di segreti con revoca/rotazione presso il provider, non solo eliminando un file dal branch.

Documenti correlati: [Runbook](../../docs/operations/firebase-hosting-runbook.md) · [Contratto Firebase](firebase-config.md).
