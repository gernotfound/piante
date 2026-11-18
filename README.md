# Piantee

Catalogo botanico pubblico e gestionale personale con una sola identità amministrativa, senza e-commerce. Fresh Start su Cloudflare Workers, Static Assets, D1 (SQL) e Kinde.

## Architettura

- `cloudflare/site/`: sito pubblico e area privata Mobile First (320 px). Catalogo anonimo tramite API pubblica; gestione privata riservata all'owner: sul candidato PR #54 aggiunta e modifica di specie, cultivar ed esemplari, pubblicazione e ritiro. Diario e lotti implementati nel candidato PR #55, con test locali e CI da completare prima dell'integrazione.
- `cloudflare/worker/`: API isolate con controlli di sessione Kinde su tutte le route private.
- `cloudflare/migrations/0001_initial.sql`: schema D1 per specie, cultivar, esemplari, codici riservati, lotti, diario e pubblicazioni. Nessun import Firebase.
- `cloudflare.config.ts`: Worker `piantee`, D1 `piantee-db`, configurazione Kinde separata da TheLogBook.
- `tests/`: unit/contratti, browser E2E, Worker+D1 nativi con workerd. `scripts/`: build Cloudflare con allowlist e controlli sugli asset privati.

## Comandi

`npm run check`, `npm run build`, `npm test`, `npm run test:browser`, `npm run build:cloudflare:cf`, `npm run test:cloudflare`.

La build Cloudflare è verificata in CI, non pubblica automaticamente senza credenziali di deployment. Nessun server di sviluppo pubblico. Per stato e configurazione live fare riferimento al [registro servizi](docs/operations/external-services-register.md), non dedurre il deployment dalla presenza del codice.

L'accesso amministrativo usa Kinde, email/password e **un solo account** creato manualmente. Registrazione pubblica disabilitata. Campi botanici sconosciuti non vengono inventati, note private non entrano nella vista pubblica e le fotografie devono corrispondere alla pianta reale.
