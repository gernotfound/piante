# GitHub — sicurezza e controllo rilascio Piantee

- `main` protetto: cambi su branch, PR draft durante le verifiche, nessun push diretto, nessun bypass dei controlli.
- La CI `.github/workflows/ci.yml` richiede Static/unit, browser E2E, Cloudflare workerd/D1, packaging e CodeQL; il job `Canonical Verification` fallisce se anche solo uno non riesce. Ogni nuovo commit invalida le verifiche precedenti.
- Le GitHub Actions usano SHA fissi, privilegi minimi e `persist-credentials: false`. CodeQL con query `security-extended`.
- Nessun deploy automatico da PR. Un rilascio Cloudflare richiederà il commit **esatto** di `main` con CI verde, binding D1 corretto, segreti Kinde dedicati e smoke test del catalogo e dei confini privati.
- Non versionare chiavi Cloudflare, credenziali Kinde, sessioni o token. L'account Cloudflare è condiviso con TheLogBook, ma lo script `piantee`, il database `piantee-db`, gli accessi e le procedure di rollback devono restare distinti.
- La rimozione del sistema Firebase dal repository elimina ogni pipeline di deploy Firebase: i provider Firebase reali potrebbero ancora contenere dati, utenti e Hosting.
