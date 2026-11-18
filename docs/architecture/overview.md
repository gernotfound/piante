# Architettura Piantee — Cloudflare Fresh Start

**Codice target:** Cloudflare Workers + Static Assets + D1 + Kinde. **Stato provider:** vedere [registro](../operations/external-services-register.md).

- `cloudflare/site/index.html` e `app.js`: vetrina pubblica e ricerca su `GET /api/v1/catalog`/categorie/dettaglio. Nessuna autenticazione visitatori.
- `cloudflare/site/admin.html` e `admin.js`: pannello owner; nel candidato PR #54 comprende form per creare/modificare specie, cultivar e piante, pubblicare/ritirare. Lotti e diario sono ancora da completare.
- `cloudflare/worker/index.js`: router; API pubbliche leggono esclusivamente la vista `public_catalog`. Tutte le route admin passano dal controllo server Kinde.
- `cloudflare/worker/kinde-auth.js`: Authorization Code + PKCE, validazione RS256 ID token/subject e sessione firmata HTTP-only host-only. L'email/password è gestita esclusivamente da Kinde; password mai nel Worker o D1.
- `cloudflare/worker/admin-inventory.js`: letture e dettagli riservati; liste paginate; dati privati non serializzati nelle API pubbliche.
- `cloudflare/migrations/0001_initial.sql`: tabella `taxa` condivisa da esemplari, `cultivars`, `seed_lots`, `specimens`, `journal_entries` append-only, `public_listings`, prenotazioni codici immutabili. Chiavi esterne, vincoli e versioni sul database.
- `scripts/build-cloudflare-site.mjs` e `scripts/assemble-cloudflare-output.mjs`: solo asset approvati nell'output. Il codice del Worker e i secret non entrano negli asset statici.
- CI `.github/workflows/ci.yml`: unit/contratti, browser E2E, emulatore workerd+D1, packaging Cloudflare, CodeQL e gate Canonical Verification.

Il target definitivo è `piantee.califano-ger.workers.dev`. Il database reale D1 UE `piantee-db` è stato creato il 18/11/2026 e inizializzato a zero record. Le API CRUD, il login live Kinde e il deploy del sito rimangono da completare e verificare.
Nessuna autenticazione, Firestore o SDK Firebase appartiene all'applicazione nuova. Il precedente provider Firebase può avere risorse live indipendenti, da dismettere separatamente dopo verifica.
