# Piantee — istruzioni operative

Repository pubblico `gernotfound/piante`; catalogo pubblico e gestionale privato, un solo amministratore. Il proprietario decide prodotto/UX; l'AI verifica e risolve aspetti tecnici.

## Fonte di verità
- Prima di modificare, verificare `main`, branch, PR, `AGENTS.md`, le regole pertinenti e gli esiti CI per l'esatto SHA; leggere chiamanti, contratti, test e configurazioni.
- GitHub descrive il codice; Cloudflare e Kinde descrivono il provider live. Non confondere test, build, merge, deploy e smoke.
- Analisi in sola lettura; implementazioni su branch con PR draft, controlli verdi sullo SHA candidato prima dello squash merge autorizzato. Mai push diretto a `main`.
- Registrare stato e limiti in `docs/operations/external-services-register.md`, senza segreti; aggiornare le issue della migrazione.

## Architettura e prodotto
- Unica applicazione Cloudflare Workers + Static Assets + D1 SQL, progetto e risorse `piantee` e `piantee-db` nello stesso account Cloudflare di TheLogBook ma **mai** con dati, Worker, sessioni o secret condivisi.
- Unica autenticazione Kinde con email/password indipendenti da Cloudflare. **Un solo account admin**; self-signup disabilitato nel tenant dedicato; il Worker autorizza esclusivamente il `sub` dell'owner verificando token e sessione. Nessuna registrazione, inviti, ruoli o tabella utenti.
- Il frontend in `cloudflare/site/`, backend in `cloudflare/worker/`, migrazioni in `cloudflare/migrations/`. `cloudflare.config.ts`, `vite.config.mjs` e `scripts/assemble-cloudflare-output.mjs` sono i contratti di build; asset client solo da allowlist `scripts/build-cloudflare-site.mjs`, mai includere file server o segreti.
- D1 `taxa`, `cultivars`, `specimens`, `seed_lots`, `journal_entries` e `public_listings`; lo schema SQL conserva vincoli FK, versioning e codici immutabili. Il pubblico legge solo `public_catalog`, mai note private. Campi botanici sconosciuti restano vuoti; niente dati inferiti o import Firebase.
- Catalogo commerciale, non e-commerce: nessun checkout, carrello, prezzi, disponibilità o contatti inventati. UX Mobile First 320 CSS px; palette Forest 173B2D, Leaf 4D7951, Paper F7F8F3, Sage E3EADC, Gold C99C52. Foto autentiche.
- Non aggiungere servizi a pagamento, upgrade di piano, R2, Storage, Functions o nuove API senza autorizzazione specifica.
- **Fresh Start (18/11/2026)**: Firebase è sistema legacy, non incluso nella nuova applicazione. Il suo account/database/Hosting live possono ancora esistere indipendentemente dal repository. Non cancellare dati reali senza verifica provider e perimetro della cancellazione.

## Sicurezza e verifiche
- Niente credenziali reali, Kinde secret, token, cookie, password, JSON di service account o dati personali in Git, issue, PR e log. Cloudflare secrets e password si impostano nel provider.
- Chiudere tutte le API admin senza configurazione o sessione valida. Per scritture usare CSRF/origin, validazione stretta, binding SQL, atomicità, versionamento/CAS. Non bypassare fallimenti allargando accessi.
- Test: `npm run check`, `npm run build`, `npm test`, `npm run test:browser`, `npm run build:cloudflare:cf` e `npm run test:cloudflare` con Miniflare installato in CI. La Canonical Verification include CodeQL e gate integrati.
- Pubblicazione target `https://piantee.califano-ger.workers.dev` direttamente, senza sito dev pubblico. Non pubblicare un sito Hello World o un Worker incompleto; testare sito e autenticazione live dopo deploy.
- Remote Desktop Commander e Firecrawl disabilitati senza autorizzazione operativa esplicita in questa chat.

## Documenti
- [Contesto migrazione](docs/operations/cloudflare-migration-context.md)
- [Registro provider](docs/operations/external-services-register.md)
- [Schema D1](docs/architecture/cloudflare-data-model.md)
- [API](docs/architecture/cloudflare-api.md)
- [Sicurezza GitHub](docs/operations/github-security-runbook.md)
- [Servizi esterni](.agents/rules/external-services.md)
