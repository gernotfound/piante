# Piante — istruzioni operative per agenti AI

Ambito: repository `gernotfound/piante`, sito pubblico del vivaio e gestionale privato. Questo file è il punto di ingresso del contesto; non è prova dello stato dei provider.

## Autorità e verifica

- Prima di intervenire leggere l'HEAD remoto di `main`, le PR/branch aperti, il diff candidato, i file pertinenti, i test e i workflow. Non dedurre lo stato attuale da una chat o da un documento storico.
- Il codice e i workflow definiscono ciò che è implementato; il provider (GitHub, Firebase, Google Cloud) definisce lo stato live. I test sull'emulatore non provano il funzionamento in Production.
- Distinguere sempre `VERIFIED-REPO`, `USER-REPORTED`, `VERIFY-LIVE` e `PENDING`. Specificare data, prova e limiti. Le istruzioni prevalgono sulle note storiche, ma non sostituiscono l'analisi delle evidenze.
- Per modifiche tecniche procedere con la soluzione minima e test di regressione appropriati. Non introdurre migrazioni, prezzi, recapiti, analytics o funzioni del vivaio non richieste.
- Comunicare in italiano: fatti verificati, ipotesi, operazioni non eseguite, blocchi e rischi residui.

## Mappa dei documenti

| Quando il task riguarda | Leggere |
|---|---|
| Firebase, Google Cloud IAM, GitHub, costi, credenziali, domini | [Servizi esterni](.agents/rules/external-services.md) e [Registro servizi](docs/operations/external-services-register.md) |
| Firebase Authentication, Firestore, separazione pubblico/privato, Hosting | [Contratto Firebase](.agents/rules/firebase-config.md) |
| Deploy, CI, permessi GitHub, messa in produzione, rollback | [Runbook di pubblicazione](docs/operations/firebase-hosting-runbook.md) |
| Sicurezza repository, ruleset main, CodeQL, alert secret scanning | [Sicurezza GitHub](docs/operations/github-security-runbook.md) |
| Migrazione Cloudflare Fresh Start: account, hostname, stato provider e handoff | [Contesto Cloudflare](docs/operations/cloudflare-migration-context.md) |
| Documenti architetturali e operativi | [Indice documenti](docs/README.md) |
| Panoramica tecnica dell'app | [Architettura](docs/architecture/overview.md) |

Aprire esplicitamente i file pertinenti: un rimando non equivale alla loro lettura.

## Architettura e invarianti

- Frontend statico in JavaScript, HTML e CSS; nessun backend custom. Hosting pubblica esclusivamente la directory generata `dist/`, non la radice del repository; `npm run build` deve ricrearla da una allowlist di asset. Leggere `src/main.js` (orchestrazione), `src/ui/` (viste), `src/domain.js`, `src/config.js`, `firebase.json` e `.firebaserc` prima di cambiare runtime o deploy.
- Firebase Authentication gestisce password e sessioni. L'autorizzazione admin dipende dall'UID in `siteOwner/primary`; non dal nome utente né da controlli della sola UI.
- `privatePlants/{id}` è solo proprietario; `catalog/{id}` è pubblico. `catalogProjection` è l'allowlist dei campi pubblicabili. Le note private NON devono mai comparire nel catalogo. Pubblicazione e rimozione devono restare coerenti fra raccolte, con transazioni atomiche e controllo delle modifiche concorrenti.
- Le Firestore Security Rules devono negare gli accessi non esplicitamente permessi. Non estendere i privilegi in risposta a `permission-denied` senza identificarne la causa.
- I dati della configurazione Web Firebase sono pubblici; password, UID reali, chiavi di servizio, token, cookie e JSON di autenticazione non vanno committati né riprodotti in documenti pubblici.
- Le foto usano URL HTTPS esterni nella baseline corrente. Non introdurre Firebase Storage, Cloud Functions, billing Blaze o altri servizi a pagamento senza decisione esplicita.

## Migrazione Cloudflare Fresh Start (pianificazione, non produzione)

- Indice operativo [EPIC #32](https://github.com/gernotfound/piante/issues/32) e fasi CF-00–CF-09. Il nuovo Cloudflare partirà con D1 **vuoto** e admin nuovo: nessun dato/account Firebase viene migrato, copiato o reso retrocompatibile. La versione corrente Firebase resta la fonte reale finché il proprietario non autorizza il cutover.
- Durante lo sviluppo Cloudflare, collocare nuovo runtime e frontend **fuori da `src/` e `styles/` legacy**, preferibilmente sotto `cloudflare/`, evitando modifiche congiunte alle sorgenti Firebase nello stesso commit. Non pubblicare nuove API o risorse private in `dist/`.
- `scripts/build-site.mjs` usa l'elenco chiuso dei soli asset client esaminati. Ogni nuovo file client richiede modifica deliberata dell'elenco e test delle dipendenze; nuovi file Worker/server non possono entrarvi.
- La catena automatica GitHub CI→Firestore Rules→Firebase Hosting applica `scripts/firebase-release-scope.mjs` in **entrambi i workflow**: modifiche Cloudflare-only o miste non autorizzano deploy Firebase. Il blocco non è un errore da aggirare, ma un confine tra i sistemi. Il passaggio finale a Cloudflare ha workflow, QA, dominio e GO separati.
- Questa sezione non autorizza provisioning, billing, DNS, accesso a dati live, squash merge o deploy. Il registro dei servizi esterni si aggiorna con le modifiche effettivamente verificate.

## Branch, test e produzione

- Nuovo lavoro su branch e PR; verificare prima PR esistenti. `main` è l'unico branch sorgente del deploy live verso **`piantee.web.app`**. Niente canali di anteprima o deploy automatico da PR.
- Non fare merge/deploy o modifiche irreversibili a provider live senza mandato appropriato; non sostituire indiscriminatamente Rules o dati Firestore.
- Eseguire `npm run check`, `npm run build`, `npm test`, `npm run test:rules` e `npm run test:browser` sulla versione candidata secondo l'ambiente disponibile; registrare lo SHA GitHub verificato. Il browser E2E usa esclusivamente i Firebase Emulator e una configurazione client fittizia. CI verde non certifica login, autorizzazioni live o Hosting aggiornato.
- Per il deploy GitHub→Google Cloud preferire **Workload Identity Federation (WIF)** tramite service account Hosting dedicato, senza key JSON permanente. Separare l'identità di deploy da Firebase Authentication e dai dati Firestore.
- Il rilascio da main attiva `deploy-firestore-rules.yml` dopo la CI e solo dopo il suo successo attiva `deploy-production.yml` (solo Hosting). Le identità WIF usano pool distinti, con condizioni dedicate ai rispettivi workflow. Nessun deploy di indici, dati o altri servizi. Le Rules richiedono test Emulator, confronto con la cronologia approvata, read-back live e arresto su drift estraneo.
- Prima di concludere distinguere: test locali, CI candidata, merge, CI main, deploy Hosting e smoke test browser sul sito reale.

## Strumenti e sicurezza

- Remote Desktop Commander e Firecrawl sono disabilitati di default: usarli solo con autorizzazione operativa esplicita nella chat corrente.
- Una richiesta di analisi autorizza lettura soltanto. Non interpretare una richiesta generica come permesso di cancellazione di dati, modifica del billing, concessione di ruoli IAM estesi o rilascio non concordato.
- Il repository è pubblico: nessun file privato, secret o export di Firebase/Google Cloud.
- Le decisioni e lo stato esterno osservato vanno registrati in `docs/operations/external-services-register.md`; il runbook contiene la procedura, non la prova di esecuzione.
- Quando cambia una configurazione esterna, aggiornare contestualmente le parti pertinenti del registro, del runbook, delle regole specialistiche e delle istruzioni; evitare copie divergenti.
