# Registro dei servizi esterni — Piante

**Rilevazione:** 2026-11-05. **Scopo:** preservare decisioni e checkpoint su GitHub, Firebase e Google Cloud. Gli stati possono cambiare senza modifiche al repository. Non contengono credenziali né UID reali.

## Legenda delle evidenze

- **VERIFIED-REPO:** letto direttamente nei file/metadata GitHub; non certifica configurazione live.
- **USER-REPORTED:** confermato dal proprietario tramite messaggi o screenshot; non verificato direttamente con API amministrative.
- **PENDING:** da configurare o verificare; non presentare come completato.
- **VERIFY-LIVE:** va ricontrollato nella console competente prima di intervenire.

## Risorse attuali

| Servizio | Identificatore pubblico / funzione | Stato al 2026-11-05 | Fonte e limite |
|---|---|---|---|
| GitHub | `gernotfound/piante`, default `main` | VERIFIED-REPO | Repo e PR #1 letti dal connettore; il codice candidato è su `feat/vivaio-site-initial` |
| PR sito | [#1](https://github.com/gernotfound/piante/pull/1) | VERIFIED-REPO | Squash merge in `main` `1eea9fe3608944106dcbfc7e2dc56cec72567c70` il 2026-11-05 |
| Firebase/GCP | Progetto `piante-a617e`, numero `401886801214` | USER-REPORTED + VERIFIED-REPO | Dati del proprietario; il project ID coincide con Web SDK e `.firebaserc` |
| Firebase piano | Spark | USER-REPORTED | Screenshot console precedente; non dimostra quote o stato fatturazione odierno |
| Firebase Web App | `src/config.js` | VERIFIED-REPO | Configurazione Web pubblica presente; non dà privilegi amministrativi |
| Firebase Authentication | Provider email/password attivo e utente proprietario creato | USER-REPORTED / VERIFY-LIVE | Il proprietario ha confermato il 2026-11-06 di aver effettuato il login tramite browser in incognito e di aver raggiunto `/admin` (Panoramica) senza errori in console. Non verificati via API l'UID e altri flussi |
| Authentication | Dominio autorizzato `piantee.web.app` | USER-REPORTED | Aggiunto dal proprietario, non letto via API |
| Firestore | Database `(default)` | USER-REPORTED | Progetto e schermata condivisi dal proprietario |
| Firestore proprietario | `siteOwner/primary` con campo `uid` stringa | USER-REPORTED | Creazione e salvataggio confermati; valore UID non conservato in documentazione |
| Firestore Rules | Policy in `firestore.rules` | VERIFIED-REPO + USER-REPORTED | Il proprietario dichiara pubblicazione delle Rules; test Emulator precedentemente passati, nessun read-back amministrativo live |
| Firebase Hosting | Site ID `piantee`, URL `https://piantee.web.app` | USER-REPORTED | Site visibile nella console; nessun deploy del codice candidato verificato |
| Firebase Storage | Non utilizzato dal frontend | VERIFIED-REPO | Immagini salvate come link HTTPS, nessuna funzionalità upload |
| Google Cloud IAM | `github-piante-hosting-675@piante-a617e.iam.gserviceaccount.com` | USER-REPORTED | Il proprietario ha confermato il 2026-11-05 il completamento della creazione e l'assegnazione dei ruoli Hosting Admin + API Keys Viewer + Service Usage Viewer; assegnazioni IAM non ancora lette direttamente dalla console/API |
| Workload Identity Federation | Pool `github-piante` / provider OIDC `github-actions` | VERIFIED-CI per autenticazione / VERIFY-LIVE per IAM | La GitHub Action `google-github-actions/auth@v3` è riuscita nel run #42100963907. Mapping, condizione e binding precisi restano da rileggere via API/console; non è stata utilizzata chiave JSON |
| GitHub Actions WIF variables | `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_FIREBASE_DEPLOY_SERVICE_ACCOUNT` | VERIFIED-CI | Run GitHub Actions #42100963907 ha superato il controllo variabili e autenticato il service account via WIF; non sono stati copiati valori riservati |
| Deploy Production | `main` → test → `piantee` live | VERIFIED-CI | Run #42102052951, SHA `ae90bf52d1b311101435d24ed94b70e93151aa9b`: sintassi, unit test, Rules emulator, WIF, release Hosting `piantee` e curl HTTP live riusciti. Login e interazione browser non verificati |

## IAM e scelta di sicurezza

La configurazione desiderata per il deploy di Hosting è un service account **dedicato** con soltanto:
- `roles/firebasehosting.admin` (pubblicazione su Hosting);
- `roles/serviceusage.apiKeysViewer` (verifica API keys dalla Firebase CLI);
- `roles/serviceusage.serviceUsageViewer` (lettura stato API, necessaria per `serviceusage.services.get` nella CLI).

GitHub deve impersonare il service account tramite WIF, limitando l'issuer GitHub al repository e al branch attendibili. Non usare credenziali JSON persistenti. NON concedere ruoli Firestore/Authentication/Storage/Cloud Run al deployer per comodità.

Identità pubbliche utili alle condizioni WIF: GitHub repository `gernotfound/piante`, repository ID `1447170331`, owner ID `295053490` (metadati GitHub visti il 2026-11-05). Il deploy deve accettare soltanto `refs/heads/main`. Questi ID sono riferimenti di configurazione, non credenziali.

Il progetto `gernotfound/logbook` è stato studiato **solo come riferimento metodologico** (AGENTS, regole specialistiche, indice, registro, WIF). Non condividere service account, pool, segreti o deployment fra i due repository.

## Punti aperti

1. Verificare direttamente nella console le assegnazioni IAM dell'account di servizio `github-piante-hosting-675` (creazione e ruoli confermati dal proprietario, non letti via API).
2. Verificare mapping, condizione del provider WIF e binding IAM di impersonificazione confermati dal proprietario; le due variabili di repository GitHub sono state visualizzate nello screenshot ma la corretta autenticazione sarà verificabile solo in GitHub Actions. La configurazione ADC viene generata automaticamente dal workflow.
3. **Completato:** PR #1 integrata in `main`; controlli sul candidato eseguiti. **Completato tramite conferma utente:** assegnazione del ruolo `roles/serviceusage.serviceUsageViewer`. Il run #42102052951 ha dimostrato deploy Hosting riuscito.
4. **Deploy Hosting verificato dai log CI**; login e schermata Panoramica confermati dal proprietario in incognito il 2026-11-06. Da verificare ancora nel browser reale CRUD privato, pubblicazione e consultazione anonima del catalogo senza operazioni distruttive.
5. Ricontrollare l'eventuale documento errato `siteOwner/uid` creato durante i primi passaggi; non eliminare senza verificarne identità e contenuto.

**Non verificato:** lettura amministrativa delle assegnazioni IAM, fatturazione/quote, smoke browser/login reale e contenuto puntuale dei file remoti. La release Hosting e la raggiungibilità HTTP del root risultano verificate dal workflow CI.

## Modifiche alla configurazione

Per ogni modifica aggiungere un checkpoint datato con **azione**, **provider**, **evidenza** (screenshot, run ID, URL o lettura API), **esito** e **verifiche residue**. Non scrivere valori privati né trattare un resoconto precedente come prova permanente.
