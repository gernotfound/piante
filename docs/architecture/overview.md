# Architettura — Piante

**Fonte:** repository. Per lo stato live fanno fede i provider e le verifiche effettive.

## Frontend

- `index.html`: HTML iniziale e metadati; `styles/base.css`, `styles/public.css`, `styles/admin.css`, `styles/responsive.css`: token/componenti, catalogo, gestionale e responsive (caricati nell'ordine originale).
- `src/main.js`: stato, URL, navigazione, eventi e avvio Firebase; controlli sulle modifiche non salvate.
- `src/ui/public.js`: viste pubbliche e login; `src/ui/admin.js`: dashboard, inventario ed editor. Lo stato resta posseduto da `main.js`.
- `src/ui/artwork.js`: fallback grafici SVG inline; foto autentiche via URL registrati.
- `src/domain.js`: modelli, validazione e allowlist `catalogProjection`.
- `src/catalog.js`: ricerca e filtri puri; `src/plant-store.js`: transazioni atomiche e conflitti; `src/config.js`: configurazione Firebase Web pubblica.
- `scripts/build-site.mjs`: genera `dist/` da una allowlist di file pubblici e moduli/stili frontend; `scripts/check-syntax.mjs` verifica ricorsivamente i sorgenti JavaScript senza elenchi manuali.
- `firebase.json` e `.firebaserc`: Hosting target `piantee`, Rules ed emulatori. La directory servita è soltanto `dist/`; documenti, test e strumenti non vengono copiati.

## Dati

- `siteOwner/primary`: UID proprietario, applicato dalle Security Rules.
- `privatePlants/{id}`: inventario riservato, note interne, provenienza e altri metadati. Il codice `#` usa l'ID documentale.
- `catalog/{id}`: proiezione dei soli campi pubblicabili. Le operazioni sulle due raccolte sono atomiche; l'editor conserva la versione caricata e blocca sovrascritture concorrenti.
- Firebase Authentication contiene password e sessioni. Gli alias opzionali non conferiscono privilegi.

## Test e rilascio

- `tests/unit/`: funzioni pure; `tests/contracts/`: vincoli di struttura e sicurezza dei workflow; `tests/integration/`: Firestore Rules e transazioni sull'emulatore; `tests/e2e/`: flussi Auth/Firestore in browser isolato.
- `npm run check`, `npm run build`, `npm test`, `npm run test:rules` e `npm run test:browser` alimentano la CI con CodeQL e Canonical Verification.
- Le PR non pubblicano il sito. Da `main`, dopo i gate, il workflow Firestore Rules precede Hosting con identità WIF distinte. I controlli CI non dimostrano lo stato live del provider.
