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
| Documenti architetturali e operativi | [Indice documenti](docs/README.md) |
| Panoramica tecnica dell'app | [Architettura](docs/architecture/overview.md) |

Aprire esplicitamente i file pertinenti: un rimando non equivale alla loro lettura.

## Architettura e invarianti

- Frontend statico in JavaScript, HTML e CSS; nessun backend custom. Leggere `src/main.js`, `src/domain.js`, `src/config.js`, `firebase.json` e `.firebaserc` prima di cambiare runtime o deploy.
- Firebase Authentication gestisce password e sessioni. L'autorizzazione admin dipende dall'UID in `siteOwner/primary`; non dal nome utente né da controlli della sola UI.
- `privatePlants/{id}` è solo proprietario; `catalog/{id}` è pubblico. `catalogProjection` è l'allowlist dei campi pubblicabili. Le note private NON devono mai comparire nel catalogo. Pubblicazione e rimozione devono restare coerenti fra raccolte, con batch atomici.
- Le Firestore Security Rules devono negare gli accessi non esplicitamente permessi. Non estendere i privilegi in risposta a `permission-denied` senza identificarne la causa.
- I dati della configurazione Web Firebase sono pubblici; password, UID reali, chiavi di servizio, token, cookie e JSON di autenticazione non vanno committati né riprodotti in documenti pubblici.
- Le foto usano URL HTTPS esterni nella baseline corrente. Non introdurre Firebase Storage, Cloud Functions, billing Blaze o altri servizi a pagamento senza decisione esplicita.

## Branch, test e produzione

- Nuovo lavoro su branch e PR; verificare prima PR esistenti. `main` è l'unico branch sorgente del deploy live verso **`piantee.web.app`**. Niente canali di anteprima o deploy automatico da PR.
- Non fare merge/deploy o modifiche irreversibili a provider live senza mandato appropriato; non sostituire indiscriminatamente Rules o dati Firestore.
- Eseguire `npm run check`, `npm test` e `npm run test:rules` sulla versione candidata quando possibile; registrare lo SHA GitHub verificato. CI verde non certifica login, autorizzazioni live o Hosting aggiornato.
- Per il deploy GitHub→Google Cloud preferire **Workload Identity Federation (WIF)** tramite service account Hosting dedicato, senza key JSON permanente. Separare l'identità di deploy da Firebase Authentication e dai dati Firestore.
- Il workflow di produzione deploya **solo Firebase Hosting**. Qualsiasi modifica alle Rules richiede verifiche e pubblicazione separate, esplicite.
- Prima di concludere distinguere: test locali, CI candidata, merge, CI main, deploy Hosting e smoke test browser sul sito reale.

## Strumenti e sicurezza

- Remote Desktop Commander e Firecrawl sono disabilitati di default: usarli solo con autorizzazione operativa esplicita nella chat corrente.
- Una richiesta di analisi autorizza lettura soltanto. Non interpretare una richiesta generica come permesso di cancellazione di dati, modifica del billing, concessione di ruoli IAM estesi o rilascio non concordato.
- Il repository è pubblico: nessun file privato, secret o export di Firebase/Google Cloud.
- Le decisioni e lo stato esterno osservato vanno registrati in `docs/operations/external-services-register.md`; il runbook contiene la procedura, non la prova di esecuzione.
- Quando cambia una configurazione esterna, aggiornare contestualmente le parti pertinenti del registro, del runbook, delle regole specialistiche e delle istruzioni; evitare copie divergenti.
