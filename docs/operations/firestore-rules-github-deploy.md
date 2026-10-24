# Firestore Rules da GitHub — Piante

Stato al 24/10/2026: preparazione repository; **NESSUNA Rules deployata live**, nessuna identità IAM creata e nessun billing modificato. Source-of-truth proposta: `firestore.rules`; il deployment è un'operazione **manuale** e deliberata, non legata a commit/merge.

## Cosa abbiamo osservato

Il proprietario ha fornito il testo attualmente visualizzato nella Console: regole su `/users/{userId}`, `plants/logs`, `expenses`, `wishlist`, `images`. La copia storica è in `docs/operations/firestore-rules-legacy-20261024.rules`, **non è una lettura provider**. Le Rules di Piante v1 sono in `firestore.rules` e usano `profiles`, `access_grants`, `handles`, `public_gardens` e `plant_media`: non hanno compatibilità automatica con `/users`. La pubblicazione del nuovo ruleset **blocca l'accesso del frontend precedente**, se ancora aperto. I documenti di `users` non verrebbero cancellati.

## Perché abbiamo preso spunto da LogBook

LogBook usa un deployer distinto per Firestore, WIF senza chiave JSON, controllo dell'exact SHA `main`, job di test prima del deploy e verifica del ruleset live via Firebase Rules REST API. Per Piante non si copia l'identità LogBook, né si automatizza la riconciliazione post-merge: il primo cutover ha un impatto distruttivo sulla **compatibilità dei vecchi client**, quindi rimane manuale.

## Configurazioni esterne necessarie — una sola volta

1. Su **Google Cloud del progetto pianta-db**, creare un **nuovo** service account dedicato alle sole Rules di Piante. Assegnare `roles/firebaserules.admin` sul progetto; non concedere Owner, Editor, Firebase Admin o ruoli Hosting/Storage/Functions. Verificare gli eventuali permessi aggiuntivi richiesti dalla versione Firebase CLI senza ampliare preventivamente i privilegi. Se l'audit è svolto da un'altra identità, basta `roles/firebaserules.viewer` per le API di lettura.
2. Predisporre Workload Identity Pool/Provider GitHub nell'account/progetto corretto, **non riutilizzare alla cieca** il binding LogBook: la trust condition deve limitare `repository_id` e `repository_owner_id` **immutabili** del repository `gernotfound/piante`; attribuire `roles/iam.workloadIdentityUser` sul nuovo service account soltanto al relativo principal GitHub. Limitare inoltre branch/workflow o environment in IAM dove possibile. Non esportare key JSON o usare `firebase login:ci`.
3. Nella repo [GitHub Settings → Secrets and variables → Actions](https://github.com/gernotfound/piante/settings/variables/actions), creare le **Repository variables** non segrete: `GCP_WORKLOAD_IDENTITY_PROVIDER` (resource name completo) e `GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT` (email del nuovo account). Non copiare le variabili di LogBook se puntano al suo progetto.
4. In GitHub **Settings → Environments** configurare `firestore-production`, aggiungendo **required reviewers** per qualsiasi deploy, e restringere i deployment branch a `main`. L'ambiente compare nel job `deploy`, non nel job di audit. Protezioni/ruleset sono impostazioni GitHub **esterne**, non sono attivate da un file YAML da solo.
5. Verificare con la Console Firebase il DB `(default)`, il numero di account/test client, i grant `access_grants/{uid}` necessari e la release precedente. Non cancellare documenti. Il sito nuovo su Hosting va coordinato con la sostituzione Rules; nessuna pubblicazione è avvenuta preparando il workflow.

## Audit di sola lettura (da GitHub)

Aprire [Firebase Firestore Rules — controlled](https://github.com/gernotfound/piante/actions/workflows/firebase-firestore-rules.yml) → **Run workflow**, branch `main`, `operation: audit`. Se WIF non è configurato fallirà senza cambiare nulla. Quando riesce, il log mostra:
- `Ruleset live: projects/pianta-db/rulesets/...`
- digest SHA-256 delle Rules live e delle Rules del commit;
- concordanza con la copia che hai inviato;
- se il cutover revoca l'accesso a `/users`.

**Non usare il solo digest come autorizzazione**: verificare provider, dati e client.

## Deploy deliberato (DOPO audit, cutover e grant)

Nel medesimo workflow: `operation: deploy`, `expected_live_ruleset` preso **per intero** dall'ultimo audit; digitare `DEPLOY_PIANTA_DB_RULES`. Se il ruleset live contiene ancora `match /users/{...}` ma quello candidato no, digitare inoltre `RETIRE_LEGACY_USERS_ACCESS` nel campo dedicato. Il workflow richiede l'approvazione nell'environment `firestore-production` se questa è stata configurata correttamente.

Il job verifica il branch `main` attuale, i tre check CI sullo SHA esatto, riesegue la suite Firebase Emulator, legge il ruleset live e rifiuta lo stato **diverso da quello auditato**, poi esegue:
```sh
npx --no-install firebase deploy --config firebase.rules-deploy.json --only firestore:rules --project pianta-db --non-interactive
```
Questa configurazione dedicata impedisce di distribuire Hosting o indici, e `firebase.json` principale resta Hosting-only. Dopo il deploy la procedura **rilegge** le Rules dal provider e confronta la sorgente normalizzata con `firestore.rules` dello SHA distribuito. Senza WIF, audit, conferme ed esito Emulator positivo **non** parte alcuna modifica.

## Ritorno indietro e coordinamento

Conservare nella Console l'ID della release/ruleset precedente, non soltanto il contenuto copiato. Se una nuova UI non riesce ad accedere dopo il cutover, il rollback delle sole Rules potrebbe ripristinare `/users` ma non salvare le operazioni già negate: controllare i dati Firestore prima di invertire l'accesso. Il rollback deve essere deliberato, con processo di approvazione e smoke test dei client interessati. La snapshot storica versionata è **un riferimento**, non va distribuita automaticamente.

Una Rules release può impiegare tempo a propagarsi alle query attive. Verificare owner, account diverso, anonimo, foto private/pubbliche, vetrina nascosta e revoca. La CI locale non sostituisce questa verifica. Non aprire registrazioni generali finché non esiste la cancellazione account trusted.

Fonti: https://firebase.google.com/docs/rules/manage-deploy ; https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines .
