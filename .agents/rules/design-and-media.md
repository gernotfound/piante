# UI responsive e immagini — contratto di prodotto

## Scelte
- Sito **non-PWA** con CSS nativo, HTML semantico ed ES modules. Nessun Service Worker, install prompt o journal locale.
- Lo stile è una **vetrina botanica personale**, non un e-commerce: colore verde bosco `#183e32`, avorio `#f8f7f2`, salvia `#879f82`, serif nei titoli e sans-serif di sistema per controlli.
- Riferimenti di ricerca e razionale in [`docs/design.md`](../../docs/design.md). Non duplicare layout o asset protetti di terzi.
- Desktop: griglia pubblica a tre colonne; smartphone due colonne, form a colonna singola e filtri orizzontali; test a 320, 375, 768 e 1440 px su Chromium e WebKit. Sono smoke test, non un audit WCAG o una certificazione su dispositivi reali.
- Gli elementi interattivi devono restare tastiera-accessibili, con focus visibile, testo alternativo e preferenze reduced-motion.

## Fotografie gestite dall'account (Firebase Spark)

- Un file JPEG/PNG/WebP/AVIF fino a 30 MB può essere selezionato dal form privato. Il browser lo decodifica e **lo comprime automaticamente** su canvas in WebP (massimo 1080 px per lato e 120 KiB). I metadati dell'originale non vengono copiati nel canvas.
- Il risultato è scritto come campo Firestore `bytes` (`Bytes` SDK) nel documento `plant_media/{username}/plants/{plantId}`. È **una foto per pianta** nella prima versione; sostituzione e rimozione sono supportate. Non richiede GitHub né accesso al repository dal browser.
- `savePlant()` scrive in un solo batch la pianta privata, l'eventuale foto nuova/rimossa e il documento pubblico. Le Rules candidate impongono coerenza fra `imageStored`, esistenza del documento media e visibilità pubblica. Il pannello utente visualizza anche le foto non condivise, ma l'account deve possedere un grant.
- Le immagini dei visitatori sono recuperate solo quando entrano vicino al viewport tramite `IntersectionObserver`; vengono riutilizzate nell'attuale sessione attraverso `blob:` URLs e liberate al logout. I documenti di testo della collezione **non contengono i byte** delle immagini.
- Se la scheda o la foto vengono rese private, le nuove letture anonime del documento media sono negate. Un visitatore che aveva già scaricato la foto potrebbe averne conservato una copia; non promettere revoca retroattiva delle copie salvate.
- I documenti devono restare molto più piccoli del limite 1 MiB Firestore. La quota gratuita Spark per il DB prevede 1 GiB di dati, 50k letture al giorno e 10 GiB/mese di traffico in uscita. Il modello è adeguato **solo a un giardino personale**, non a cataloghi fotografici grandi o visite massicce. Limiti e quota vanno monitorati.
- L'eventuale vecchio `imageUrl` riferito a `/images` o a URL HTTPS resta pubblicamente accessibile anche se la scheda non è condivisa. Non confondere la sua privacy con quella del media Firestore.
- Cloud Storage for Firebase richiede Blaze ed è intenzionalmente escluso. Non introdurre Cloud Functions/Blaze, token GitHub nel browser o backend che permettano upload non autenticati.

## Funzionalità future
- Contatto visitatore-proprietario: solo quando saranno definiti consenso del proprietario, canali pubblicati e prevenzione spam. Nessun indirizzo email personale esposto implicitamente.
- Ricerca/tag: i filtri pubblici riguardano solo tag pubblicati per ogni singola pianta. Non rivelare l'elenco di tag privati.
