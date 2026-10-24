# UI responsive e immagini — contratto di prodotto

## Scelte
- Sito **non-PWA** con CSS nativo, HTML semantico ed ES modules. Nessun Service Worker, install prompt o journal locale.
- Lo stile è una **vetrina botanica personale**, non un e-commerce: colore verde bosco `#183e32`, avorio `#f8f7f2`, salvia `#879f82`, serif nei titoli e sans-serif di sistema per controlli.
- Riferimenti di ricerca e razionale in [`docs/design.md`](../../docs/design.md). Non duplicare layout o asset protetti di terzi.
- Desktop: griglia pubblica a tre colonne; smartphone due colonne, form a colonna singola e filtri orizzontali; test a 320, 375, 768 e 1440 px su Chromium e WebKit. Sono smoke test, non un audit WCAG o una certificazione su dispositivi reali.
- Gli elementi interattivi devono restare tastiera-accessibili, con focus visibile, testo alternativo e preferenze reduced-motion.

## Fotografie (Spark)
- `web/images/` sono asset statici distribuiti da Firebase Hosting e visibili da URL anche quando il documento Firestore non è pubblico. Nel repository GitHub pubblico la cronologia può contenerle per sempre.
- **MUST:** non inserire immagini private, coordinate EXIF, fotografie del diario riservate o dati identificativi fra gli asset statici.
- Editor attuale: l'utente sceglie una foto e usa la conversione browser-canvas in **WebP** (lato lungo massimo 1400px, qualità circa 0,78), scarica il file, lo carica **manualmente** in `web/images/` su GitHub, quindi inserisce `/images/nome.webp` nella scheda. La conversione canvas tende a perdere EXIF ma va validata per ogni flusso di pubblicazione.
- La presenza di un file su GitHub **non** costituisce un deploy Hosting. Anche una foto rimossa dalla scheda può restare in CDN, cache o history.
- URL HTTPS esterni sono ammessi nell'editor, ma dimensione, disponibilità e privacy dipendono dal provider; niente URL HTTP o schemi eseguibili.
- `loading=lazy` e `decoding=async` per le schede, placeholder grafico SVG senza download di fotografie stock. Aggiungere `srcset/sizes` solo se esistono più risoluzioni disponibili.
- Nessuna integrazione Firebase Storage in piano Spark; non simulare upload automatici con credenziali GitHub nel browser.

## Funzionalità future
- Contatto visitatore-proprietario: solo quando saranno definiti consenso del proprietario, canali pubblicati e prevenzione spam. Nessun indirizzo email personale esposto implicitamente.
- Ricerca/tag: i filtri pubblici riguardano solo tag pubblicati per ogni singola pianta. Non rivelare l'elenco di tag privati.
