# Sicurezza GitHub e chiave Firebase pubblica — Piante

**Ultima verifica:** 2026-11-06. **Repository:** `gernotfound/piante`. Le condizioni GitHub non sono codificate integralmente nei workflow: le impostazioni live nella console GitHub prevalgono su questo documento.

## Evidenze prima dell'hardening

| Controllo | Piante osservato | Logbook osservato |
|---|---|---|
| `main` protetto | No (`protected=false`) | Sì |
| Repository rulesets | Nessuno | `protect main branch` attivo |
| Ruleset `main` | Non presente | PR obbligatoria, 0 approvazioni obbligatorie, discussioni risolte, status `Canonical Verification` strict, linear history, niente delete o force-push, nessun bypass |
| Dependabot version updates | `.github/dependabot.yml` assente | npm + github-actions settimanali |
| CI e deploy | Verifiche PR/push e Hosting su push a main indipendenti | CodeQL e gate canonico; production vincolata a run di verifica riuscita |

Le letture GitHub non provano le impostazioni di sicurezza non accessibili al connettore: push protection, token permissions, CodeQL default setup, branch environments, stato effettivo degli avvisi.

**Controllo live successivo (2026-11-06):** GitHub restituisce ruleset `protect main branch` ID `26683653`, `enforcement=active`, target `~DEFAULT_BRANCH`, lista bypass vuota, `main.protected=true`, regole `deletion`, `non_fast_forward`, `required_linear_history`, PR obbligatoria con 0 reviews e conversazioni risolte, `allowed_merge_methods=[squash]` e `require_extra_approval_for_unattributed_changes=false`, controllo `Canonical Verification` della GitHub Actions App ID 15368 con `strict_required_status_checks_policy=true`. Le due differenze iniziali rispetto a Logbook sono state corrette dall'amministratore e confermate via GitHub API. Le altre impostazioni esterne restano da verificare.

## Alert «Google API Key #1»

La chiave `apiKey` in `src/config.js` è la **configurazione pubblica della Firebase Web App**. Secondo la documentazione ufficiale Firebase, non è una credenziale amministrativa e va inclusa nella configurazione del client, se limitata alle API Firebase appropriate. Nasconderla nelle variabili GitHub compilate nel client non ne restringe l'utilizzo: è comunque leggibile in rete/browser.

**Non ruotare o revocare alla cieca.** Verificare prima in Google Cloud Console → API e servizi → Credenziali, chiave *Browser key (auto created by Firebase)*:
1. Verificare che corrisponda alla Firebase Web App di `piante-a617e`.
2. **Restrizioni API:** solo API Firebase effettivamente necessarie; per email/password sono rilevanti `identitytoolkit.googleapis.com` e `securetoken.googleapis.com`. Non autorizzare API generative o altri servizi non correlati (specie a pagamento).
3. Esaminare le restrizioni applicazione e l'uso effettivo; evitare cambiamenti senza test, perché una configurazione errata può bloccare il login.
4. Esaminare quota/metriche dei servizi di autenticazione e i log disponibili per anomalie. Verificare Firestore Rules pubblicate rispetto al modello dati; il test emulator non prova le regole live.
5. Solo dopo verifica che sia una API key Firebase pubblica, limitata e non abusata, chiudere il relativo alert GitHub come **false positive** con motivazione. Non segnare `revoked` se la chiave è ancora in uso.
6. Non aggiungere `secret_scanning.yml` per escludere `src/config.js`: potrebbe nascondere segreti realmente inseriti in futuro.

Fonte: https://firebase.google.com/docs/projects/api-keys

## Ruleset di produzione da attivare via GitHub Settings

**Prima:** aspettare che la PR di hardening abbia eseguito con successo il job `Canonical Verification`. Questo check non esiste nel vecchio workflow di `main` e non va configurato prima che GitHub lo abbia riconosciuto.

Aprire `https://github.com/gernotfound/piante/settings/rules` (Settings → Rules → Rulesets → New branch ruleset).

| Impostazione | Valore consigliato |
|---|---|
| Name | `protect main branch` |
| Enforcement | `Active` |
| Target branches | `main` / `~DEFAULT_BRANCH` |
| Bypass list | Vuota |
| Restrict deletions | Sì |
| Block force pushes | Sì (`non_fast_forward`) |
| Require a pull request before merging | Sì |
| Required approving reviews | **0**: repository personale, senza imporre approvazioni impossibili |
| Require conversation resolution | Sì |
| Require status checks to pass | Sì |
| Required check | `Canonical Verification` (source `GitHub Actions`, se offerta) |
| Require branch up to date before merging | Sì (`strict`) |
| Require linear history | Sì; usare squash merge |
| Required deployments before merging | No: qui il deploy è successivo al merge, non una preview |

La configurazione replica il contratto del ruleset `logbook` osservato via GitHub API il 2026-11-06. Non attivare insieme un vecchio branch protection rule contraddittorio.

**Verifica dopo salvataggio:** leggere dal provider il ruleset `active`, la condizione su `~DEFAULT_BRANCH`, le regole e il branch `protected=true`. Aprire una PR innocua e controllare che GitHub impedisca il merge prima del gate richiesto.

## Altri controlli esterni a Git

In Settings → Actions → General:
- **Workflow permissions:** concedere per impostazione predefinita solo *Read repository contents permission*; i job di deploy dichiarano separatamente `id-token: write` per WIF e il job CodeQL dichiara `security-events: write`.
- Non permettere a GitHub Actions di creare/approvare PR automaticamente, salvo esigenza esplicita e verificata.
- Valutare in Settings → Environments → `production` il vincolo dei deployment branches al solo `main`; approvazioni manuali dell'environment non sono attivate per mantenere il deploy automatico.

In Settings → Advanced Security (o sezione sicurezza equivalente):
- Abilitare secret scanning / push protection per chiavi **realmente riservate**; non escludere indiscriminatamente i file client.
- Controllare CodeQL: il progetto implementa **advanced setup nel workflow CI**, quindi evitare l'attivazione concorrente del default setup per lo stesso linguaggio.
- Abilitare Dependabot alerts e security updates, se disponibili.
- Esaminare periodicamente i log delle azioni, i permessi delle GitHub Apps, i token PAT e proteggere l'account GitHub con passkey/2FA.

## Contratto del rilascio nel repository

- Il CI `.github/workflows/ci.yml` usa permessi `contents: read` per default. Test sintattici/unitari, Firestore emulator e CodeQL sono requisiti cumulativi del job `Canonical Verification`.
- Il deploy `.github/workflows/deploy-production.yml` non si avvia da PR né manualmente: soltanto da un `workflow_run` CI concluso con successo per evento `push` su `main` del repository corrente.
- Il deployer controlla ancora che SHA verificato, checkout e `main` remoto corrispondano, prima di usare la federazione GitHub OIDC e pubblicare solo Hosting.
- Le Actions esterne sono referenziate tramite commit SHA immutabili; Dependabot segnalerà aggiornamenti.
- `github/codeql-action/init` e `github/codeql-action/analyze` condividono lo stesso SHA di release: CodeQL richiede versioni identiche nello stesso job. Dependabot le raggruppa tramite `groups.codeql` in `.github/dependabot.yml`, evitando aggiornamenti indipendenti che interrompono `Canonical Verification`.
- `npm install` rimane **non riproducibile** senza `package-lock.json`; il prossimo incremento di sicurezza deve generare un lockfile reale da una versione effettivamente risolta e usare `npm ci`. Non inventare un lockfile. Fino ad allora, pin SHA delle Actions non fissa le dipendenze npm.

## Limiti e verifiche

Questo documento descrive un **candidato**: la presenza dei file nel branch non dimostra regole GitHub attive o un deploy riuscito. L'assenza di accesso amministrativo via connettore non autorizza a dichiarare modificati i settings GitHub. Non alterare IAM o chiavi Firebase senza controllo live e piano di recupero.
