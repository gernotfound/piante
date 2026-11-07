# Pubblicazione Firebase Hosting — runbook Piante

**Stato:** prima pubblicazione Production riuscita da GitHub Actions il 2026-11-05; la procedura descrive anche deploy futuri. Il documento non prova da solo lo stato attuale del provider. Consultare il [registro](external-services-register.md) per i checkpoint reali.

## Perimetro

- Sito live: `https://piantee.web.app`; Firebase project ID: `piante-a617e`.
- GitHub: `gernotfound/piante`; `main` è l'unico branch che può pubblicare.
- Nessuna anteprima: il workflow distribuisce direttamente sul target `piantee` con `npx firebase deploy --only hosting:piantee`.
- Il job Hosting distribuisce solo `piantee`; prima viene eseguito un job separato per riconciliare esclusivamente le Firestore Security Rules del database `(default)`, senza scrivere dati, indici, Storage, Auth o billing. Se il job Rules fallisce, Hosting non parte.

## Configurazione una tantum su Google Cloud

### 1. Identità di deploy

Il proprietario ha indicato l'account di servizio:

`github-piante-hosting-675@piante-a617e.iam.gserviceaccount.com`

Durante la creazione, nel passaggio **Autorizzazioni (facoltativo)** assegnare **Firebase Hosting Admin** (`roles/firebasehosting.admin`), **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`) e **Service Usage Viewer** (`roles/serviceusage.serviceUsageViewer`); non usare Owner, Editor, Cloud Run Admin o Firebase Auth Admin. La sezione di autorizzazione di terze entità può restare vuota; l'impersonazione GitHub sarà configurata dopo la creazione.

Non creare chiavi JSON permanenti: la versione preferita usa Workload Identity Federation (WIF).

### 2. Federazione GitHub OIDC (da eseguire)

In Google Cloud IAM → Workload Identity Federation:

1. Creare un **pool** dedicato per `piante` e un **provider OIDC** con issuer GitHub `https://token.actions.githubusercontent.com`.
2. Impostare gli attributi di mapping: `google.subject = assertion.sub`, `attribute.repository_id = assertion.repository_id`, `attribute.repository_owner_id = assertion.repository_owner_id`. Il provider deve applicare una **attribute condition** su ID immutabili `1447170331` e `295053490` e sul ref `refs/heads/main`, evitando accesso da altri repository/branch.
3. Autorizzare il principal del repository sul service account con ruolo `roles/iam.workloadIdentityUser`. Non autorizzare tutto il pool in modo indiscriminato.
4. Annotare l'identificatore completo del provider nella forma `projects/401886801214/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`. Non è un segreto.

Per il primo setup seguire la console effettiva; verificare provider e binding prima di affermare che siano attivi.

### 3. Variabili GitHub Actions (da eseguire)

Aprire `https://github.com/gernotfound/piante/settings/variables/actions`, creare due **repository variables** (non secrets):

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: percorso completo del provider WIF del punto precedente.
- `GCP_FIREBASE_DEPLOY_SERVICE_ACCOUNT`: email del service account del punto 1.

Nessun `FIREBASE_SERVICE_ACCOUNT` JSON è richiesto dal workflow WIF. Non caricare chiavi private nel repository o nel browser.

## Identità Firestore Rules (da configurare separatamente)

L'utente ha autorizzato il 2026-11-07 la creazione di un'identità separata, senza chiavi JSON e senza ampliare i privilegi del deployer Hosting.

1. Nel progetto `piante-a617e`, creare il service account `github-piante-firestore-rules`, indirizzo atteso `github-piante-firestore-rules@piante-a617e.iam.gserviceaccount.com`. Non creare chiavi.
2. Attribuire al nuovo service account, a livello di progetto, solo il ruolo predefinito **Firebase Rules Admin** (`roles/firebaserules.admin`). Questo ruolo amministra i ruleset di Firebase, non i documenti Firestore e non gli indici. È il ruolo predefinito pertinente; per limitare anche le operazioni di gestione Rules non utilizzate servirebbe un ruolo personalizzato, da valutare separatamente.
3. Nel nuovo service account, scheda Autorizzazioni/Principali con accesso, aggiungere come principal WIF del solo repository Piante:
   `principalSet://iam.googleapis.com/projects/401886801214/locations/global/workloadIdentityPools/github-piante/attribute.repository_id/1447170331`
   con `roles/iam.workloadIdentityUser`. Verificare prima che il provider WIF corrente mappi `attribute.repository_id` e limiti GitHub a repository ID `1447170331`, owner ID `295053490` e ref `refs/heads/main`. Non concedere accesso a tutto il pool.
4. In GitHub → Settings → Secrets and variables → Actions → Variables aggiungere la variabile non segreta `GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT` con l'email esatta del nuovo account. Riutilizzare la variabile `GCP_WORKLOAD_IDENTITY_PROVIDER` esistente, senza modificare quella Hosting. Confermare nella console valori salvati e binding effettivi.

Connettori e repository GitHub non dimostrano né eseguono automaticamente queste impostazioni IAM. Non integrare la PR di automazione fino alla verifica dell'identità WIF.

## Rilascio

1. Verificare PR e SHA candidato, eseguire `npm run check`, `npm test`, `npm run test:rules` (oppure esaminare i corrispondenti job CI sul medesimo SHA).
2. Integrare la PR su `main` soltanto nel perimetro autorizzato.
3. Il workflow `.github/workflows/deploy-production.yml` si avvia solo da CI riuscita di un `push` a `main` e verifica lo SHA corrente. Non è disponibile `workflow_dispatch` o preview PR.
4. Il job `firestore-rules` autentica il service account dedicato con WIF, legge release e sorgente Rules live via Firebase Rules API, confronta i token con `firestore.rules` dell'ultimo main e del suo genitore. Commenti e spazi possono differire; una variazione di comportamento inattesa causa errore senza sovrascrivere. Solo se la sorgente live corrisponde alla versione precedente, crea un ruleset immutabile e aggiorna il release `cloud.firestore` (database default); rilegge la release e attende 10 minuti se effettivamente modificata, per prudenza durante la propagazione.
5. Il job `deploy`, vincolato con `needs: [firestore-rules]`, usa il precedente account Hosting WIF per pubblicare soltanto `hosting:piantee`; controlla ancora lo SHA prima del deploy. Se manca la nuova variabile o un controllo Rules fallisce, Hosting viene bloccato.
6. Verificare separatamente nei provider: versione Rules rilasciata, CI main sullo SHA, job Hosting completato e smoke HTTP. Non considerare il read-back della release una prova che ogni listener già aperto abbia ricevuto la modifica.
7. Eseguire smoke non distruttivi: Home e catalogo anonimo, login proprietario, inventario riservato, logout, URL di una pianta. Non modificare dati reali per test senza autorizzazione specifica.

## Diagnosi e rollback

- Una modifica manuale alle Rules live non presente su `main` provoca un arresto controllato (drift). Prima riconciliare la modifica e ripetere la CI; non bypassare i controlli.
- Firebase mantiene la cronologia dei Ruleset: registrare release e SHA, poi ripristinare la versione appropriata dal provider quando necessario. Il rollback di Hosting non ripristina le Rules.
- In un merge con nuovi campi pubblici (es. PR #9) il job Rules deve concludersi prima di Hosting, senza modifiche ai dati esistenti o a IAM.


### Prima pubblicazione riuscita — 2026-11-05

- Dopo la conferma dell'assegnazione di `roles/serviceusage.serviceUsageViewer` da parte del proprietario, la PR #2 è stata integrata in `main`.
- GitHub Actions [#42102052951](https://github.com/gernotfound/piante/actions/runs/42102052951), commit `ae90bf52d1b311101435d24ed94b70e93151aa9b`: controlli di sintassi, unit test e Rules emulator superati.
- Autenticazione WIF senza chiavi private riuscita; Firebase CLI ha completato la release del site `piantee` e stampato `Deploy complete!`.
- Il controllo HTTP del workflow (`curl --fail` su `https://piantee.web.app/`) è riuscito.
- Restano da provare nel browser login reale, Firestore privato, CRUD e catalogo pubblico; la verifica HTTP del root non equivale a E2E.


### Prima esecuzione — 2026-11-05

- La PR #1 è stata integrata in `main` (SHA `1eea9fe3608944106dcbfc7e2dc56cec72567c70`).
- Il workflow run [#42100963907](https://github.com/gernotfound/piante/actions/runs/42100963907) ha superato test, controllo variabili, autenticazione WIF e verifica del commit.
- La Firebase CLI ha risposto **HTTP 403** alla richiesta Service Usage `GET .../services/firebasehosting.googleapis.com`. Non è stata pubblicata una release del candidato tramite quel run.
- Causa immediata: assenza del permesso `serviceusage.services.get` sul service account deployer; il ruolo minimo predefinito pertinente è `roles/serviceusage.serviceUsageViewer`.
- Prossima azione: aggiungere il ruolo in IAM al service account di deploy, confermarlo e riavviare il workflow senza bypassare i test. Non assegnare Editor/Owner o Service Usage Admin.


- CI test falliti: correggere il codice o le Rules, non ignorare i test.
- GitHub senza permesso OIDC: verificare `id-token: write`, issuer, attributi, condition, binding del service account e repository variables.
- Hosting fallito: separare errori IAM/API da errori di target `piantee`. Non rilassare i privilegi indiscriminatamente.
- Sito raggiungibile ma login o Firestore falliscono: controllare Web SDK, Auth Authorized domains, UID proprietario, Rules e console network.
- Hosting pubblicato ma regressione: valutare rollback alla precedente release Hosting dalla console, senza toccare Firestore o Auth. Il rollback di asset statici non ripristina automaticamente dati o Rules.

## Riferimenti

- [GitHub OIDC e WIF](https://github.com/google-github-actions/auth)
- [Firebase Hosting IAM](https://firebase.google.com/docs/projects/iam/roles-predefined-product)
- [Registro operativo](external-services-register.md)
