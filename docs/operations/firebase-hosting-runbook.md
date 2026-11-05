# Pubblicazione Firebase Hosting — runbook Piante

**Stato:** procedura in preparazione al primo deploy. La sua presenza non prova l'esecuzione. Consultare il [registro](external-services-register.md) per i checkpoint reali.

## Perimetro

- Sito live: `https://piantee.web.app`; Firebase project ID: `piante-a617e`.
- GitHub: `gernotfound/piante`; `main` è l'unico branch che può pubblicare.
- Nessuna anteprima: il workflow distribuisce direttamente sul target `piantee` con `npx firebase deploy --only hosting:piantee`.
- Il workflow NON modifica Firestore Rules, Auth, dati, Storage, billing o altri siti Hosting.

## Configurazione una tantum su Google Cloud

### 1. Identità di deploy

Il proprietario ha indicato l'account di servizio:

`github-piante-hosting-675@piante-a617e.iam.gserviceaccount.com`

Durante la creazione, nel passaggio **Autorizzazioni (facoltativo)** assegnare **Firebase Hosting Admin** (`roles/firebasehosting.admin`) e **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`); non usare Owner, Editor, Cloud Run Admin o Firebase Auth Admin. La sezione di autorizzazione di terze entità può restare vuota; l'impersonazione GitHub sarà configurata dopo la creazione.

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

## Rilascio

1. Verificare PR e SHA candidato, eseguire `npm run check`, `npm test`, `npm run test:rules` (oppure esaminare i corrispondenti job CI sul medesimo SHA).
2. Integrare la PR su `main` soltanto nel perimetro autorizzato.
3. Il workflow `.github/workflows/deploy-production.yml` si avvia su push a `main`; può essere avviato manualmente soltanto da `main`. Controlla sintassi, test unitari e Rules emulator prima dell'autenticazione WIF.
4. Il deployer verifica che `main` remoto coincida con lo SHA candidato e pubblica **solo Hosting** sul target `piantee`. Un errore ferma il job; non sostituire un fallimento WIF con un token personale.
5. Controllare su GitHub Actions l'esito del job e su Firebase Console la release del site `piantee`.
6. Eseguire smoke non distruttivi: Home e catalogo da browser anonimo, login proprietario, inventario riservato, logout, URL di una pianta. Per la scrittura usarne una sintetica soltanto se esplicitamente autorizzato; non modificare dati reali per diagnosticare.

## Diagnosi e rollback

- CI test falliti: correggere il codice o le Rules, non ignorare i test.
- GitHub senza permesso OIDC: verificare `id-token: write`, issuer, attributi, condition, binding del service account e repository variables.
- Hosting fallito: separare errori IAM/API da errori di target `piantee`. Non rilassare i privilegi indiscriminatamente.
- Sito raggiungibile ma login o Firestore falliscono: controllare Web SDK, Auth Authorized domains, UID proprietario, Rules e console network.
- Hosting pubblicato ma regressione: valutare rollback alla precedente release Hosting dalla console, senza toccare Firestore o Auth. Il rollback di asset statici non ripristina automaticamente dati o Rules.

## Riferimenti

- [GitHub OIDC e WIF](https://github.com/google-github-actions/auth)
- [Firebase Hosting IAM](https://firebase.google.com/docs/projects/iam/roles-predefined-product)
- [Registro operativo](external-services-register.md)
