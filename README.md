# Piante

Piante è una PWA botanica **offline-first**, con un'area privata per gestire la propria collezione e una vetrina pubblica per condividere singoli esemplari.

**Stato:** M0 — fondazione tecnica. Il frontend è deliberatamente una shell non collegata ai dati reali.

- Repository nuovo: `gernotfound/piante`.
- Riferimento tecnico: `gernotfound/logbook`; riferimento funzionale legacy: `gernotfound/pianta`.
- Hosting desiderato: `https://piante.web.app` sul sito Firebase `piante` nel progetto `pianta-db`.
- Nessun deploy automatico, nessuna scrittura Firebase e nessuna API di backend prevista in M0.
- Nessun Google Analytics o tracciamento di utilizzo integrato.

## Rotte previste

| Rotta | Destinazione |
| --- | --- |
| `/` | Introduzione pubblica |
| `/app` | Area personale (in M0 segnaposto) |
| `/:username/public` | Vetrina pubblica (in M0 segnaposto) |
| `/:username/public/:slug` | Scheda pianta pubblica (in M0 segnaposto) |

Nessuna pagina M0 interroga Firestore. La pubblicazione reale sarà sviluppata soltanto dopo le Security Rules e i relativi test.

## Avvio

Node.js 24 e npm 11:

```sh
npm ci
npm run dev
```

Verifiche:

```sh
npm run verify
npm run test:e2e
```

La build `npm run build` genera anche le icone PWA a partire da `assets/icon.svg`.
Gli asset generati sono esclusi dal repository.

## Documentazione

- [AGENTS.md](AGENTS.md) — invarianti e procedure per agenti e manutentori.
- [Architettura](docs/architecture/overview.md).
- [Confine pubblico/privato e dati](docs/architecture/data-privacy.md).
- [Distribuzione Firebase](docs/operations/deployment.md).

## Sicurezza dello sviluppo

Il progetto Firebase `pianta-db` contiene anche dati e configurazioni della vecchia Pianta. **Non eliminare o modificare collezioni legacy, Rules live, utenti Auth o hosting esistente senza audit e piano di migrazione reversibile.** In M0 non è previsto alcun deployment automatico.

La pipeline di verifica non usa segreti o credenziali Firebase reali. Solo una modifica verificata e approvata potrà successivamente attivare la distribuzione.


## M1 — Fondamenta del dominio offline

Il modulo botanico dispone ora di schemi runtime Zod, operazioni di dominio e una repository locale IndexedDB con journal atomico. **Non è ancora collegato all'interfaccia, all'autenticazione o a Firestore.** L'area `/app` continua a mostrare un segnaposto fino alle milestone UI e account.

Vedi [contratto di persistenza locale](docs/architecture/offline-storage.md) per recovery, versioni e limiti.
