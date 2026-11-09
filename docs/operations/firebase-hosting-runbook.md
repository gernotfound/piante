# Pubblicazione Firebase Hosting — runbook Piante

**Stato:** prima pubblicazione Production riuscita da GitHub Actions il 2026-11-05; la procedura descrive anche deploy futuri. Il documento non prova da solo lo stato attuale del provider. Consultare il [registro](external-services-register.md) per i checkpoint reali.

## Perimetro

- Sito live: `https://piantee.web.app`; Firebase project ID: `piante-a617e`.
- GitHub: `gernotfound/piante`; `main` è l'unico branch che può pubblicare.
- Nessuna anteprima: il workflow distribuisce direttamente sul target `piantee` con `npx firebase deploy --only hosting:piantee`.
- Hosting pubblica solo `piantee` dopo il completamento verde del workflow Firestore separato. Firestore riconcilia soltanto le Security Rules di `(default)`, senza pubblicare indici, dati, Storage, Auth o billing.

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

## Identità Firestore Rules — configurazione separata

**Stato 2026-11-09 (USER-REPORTED via screenshot):** esiste il service account
`github-piante-firestore-rules@piante-a617e.iam.gserviceaccount.com`, abilitato;
nell'IAM di progetto è visibile `Firebase Rules Admin`. Non ricrearlo e non ampliare
i privilegi. Il binding di impersonificazione sul service account non è ancora
verificato. La correzione della condizione `umain` → `main` nel provider Hosting
è stata dichiarata salvata dal proprietario, senza read-back amministrativo.

### Pool Firestore distinto da Hosting

Hosting continua a usare il pool `github-piante`, provider `github-actions`,
service account `github-piante-hosting-675` e la variabile GitHub già esistente
`GCP_WORKLOAD_IDENTITY_PROVIDER`. Non modificarli durante il setup Firestore.

Per Firestore, creare **solo dopo autorizzazione operativa** un pool WIF dedicato
`github-piante-firestore` con un unico provider OIDC `github-actions`. Usare:

- Issuer OIDC: `https://token.actions.githubusercontent.com`.
- Mapping: `google.subject = assertion.sub`;
  `attribute.repository_id = assertion.repository_id`;
  `attribute.repository_owner_id = assertion.repository_owner_id`;
  `attribute.ref = assertion.ref`;
  `attribute.workflow_ref = assertion.workflow_ref`.
- Condizione CEL:
  ```cel
  attribute.repository_id == '1447170331' &&
  attribute.repository_owner_id == '295053490' &&
  attribute.ref == 'refs/heads/main' &&
  attribute.workflow_ref == 'gernotfound/piante/.github/workflows/deploy-firestore-rules.yml@refs/heads/main'
  ```
- ID completo atteso:
  `projects/401886801214/locations/global/workloadIdentityPools/github-piante-firestore/providers/github-actions`.

Concedere **solo al service account Firestore** il ruolo
`roles/iam.workloadIdentityUser` per il principal della nuova pool:
`principalSet://iam.googleapis.com/projects/401886801214/locations/global/workloadIdentityPools/github-piante-firestore/attribute.repository_id/1447170331`.
Non concedere l'intero pool, il pool Hosting o diritti sul service account Hosting.
Verificare in console che il binding sia davvero salvato.

In GitHub → Settings → Secrets and variables → Actions → Variables, creare:

- `GCP_FIRESTORE_WORKLOAD_IDENTITY_PROVIDER` con l'ID completo nuovo sopra;
- `GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT` con l'indirizzo dell'account già esistente.

I due valori sono identificativi pubblici, non segreti. Non cambiare le variabili
Hosting e non creare chiavi JSON.

### Flusso di pubblicazione (solo dopo setup verificato e PR approvata)

1. La CI `Verifica codice` valida sintassi, test e Rules Emulator sul candidato.
2. Un merge approvato su `main` avvia la CI main. Se riesce, `.github/workflows/deploy-firestore-rules.yml` verifica lo SHA e autentica esclusivamente l'account Firestore.
3. Il reconciler REST legge la release di `(default)` e la sua sorgente. Se identica alla sorgente desiderata non scrive; se corrisponde a un Rules file nella **storia Git approvata** può pubblicare la nuova versione; su drift sconosciuto o API non leggibile fallisce senza sostituire la release. Questo consente di recuperare rilasci saltati senza usare `HEAD^` come unica baseline.
4. Dopo la pubblicazione, rilegge la release e attende 10 minuti soltanto se modificata. L'API non fornisce un aggiornamento condizionale atomico della release: una modifica concorrente fra secondo GET e PATCH resta un rischio residuo. Non effettuare editing manuale parallelo.
5. Solo il successo del workflow Firestore attiva `.github/workflows/deploy-production.yml`, che continua a pubblicare esclusivamente `hosting:piantee` usando l'account Hosting e controlla lo SHA.
6. Verificare separatamente versione Rules live, CI e job Hosting, HTTP, accesso anonimo al catalogo e amministrazione non distruttiva. Non dedurre il runtime dai test Emulator.

Il flusso è analogo a LogBook per ordine dei release ma resta più ristretto:
**solo Rules, non indici**. Usiamo l'API Firebase Security Rules già testata
in questa PR anziché Firebase CLI per non aggiungere ruoli di lettura delle API
a un account che attualmente dispone soltanto di `roles/firebaserules.admin`.

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
