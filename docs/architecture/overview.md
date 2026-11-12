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
- `privatePlants/{id}`: inventario riservato, note interne, provenienza, stato, lotto e altri metadati. Il codice `#` usa l'ID documentale (autorevole anche se nel record legacy esiste un campo `id`). L'editor preserva un gruppo botanico storico esplicito se la categoria non viene cambiata, evitando riclassificazioni involontarie.
- `plantProfiles/{id}`: schede condivise di specie e cultivar, sempre leggibili dal proprietario e pubblicamente consultabili solo dopo la prima pubblicazione (`public=true`); scrivibili solo dal proprietario. I documenti `catalog` e `privatePlants` possono referenziarle per ID. Il client unisce i dati alla lettura, senza migrazioni o fan-out: una correzione alle caratteristiche comuni modifica la vista di tutti gli esemplari collegati. Per le schede legacy senza ID di specie si tenta esclusivamente la corrispondenza esatta del nome comune. Una cultivar non viene inferita dal seme del suo frutto.
- `seedLots/{id}`: lotti privati con nome, specie e provenienza; `privatePlants/{id}/events/{eventId}`: diario e storico immutabile delle operazioni, entrambi leggibili solo dal proprietario.
- `catalog/{id}`: proiezione dei soli campi pubblicabili. Le operazioni sulle raccolte private/pubbliche e sulle schede condivise coinvolte sono atomiche; l'editor conserva la versione caricata e blocca sovrascritture concorrenti.
- Firebase Authentication contiene password e sessioni. Gli alias opzionali non conferiscono privilegi.

## Test e rilascio

- `tests/unit/`: funzioni pure; `tests/contracts/`: vincoli di struttura e sicurezza dei workflow; `tests/integration/`: Firestore Rules e transazioni sull'emulatore; `tests/e2e/`: flussi Auth/Firestore in browser isolato.
- `npm run check`, `npm run build`, `npm test`, `npm run test:rules` e `npm run test:browser` alimentano la CI con CodeQL e Canonical Verification.
- Le PR non pubblicano il sito. Da `main`, dopo i gate, il workflow Firestore Rules precede Hosting con identità WIF distinte. I controlli CI non dimostrano lo stato live del provider.

## Limiti noti del modello condiviso

I documenti `catalog` mantengono una proiezione di compatibilità: i client che leggono direttamente Firestore senza applicare il profilo condiviso possono mostrare il valore precedente di un attributo. Il frontend Piante risolve i profili in tempo reale. Le note private, il lotto, il diario e lo stato non vengono copiati in `catalog` o `plantProfiles`. La cancellazione definitiva di un documento Firestore non elimina automaticamente la sottoraccolta privata `events`: preferire la conservazione dello stato storico e valutare una politica esplicita di eliminazione degli eventi prima di abilitare cancellazioni massive.

## Eliminazione in presenza di diario

La cancellazione di una pianta con osservazioni manuali è rifiutata: si può invece mantenere la scheda con stato «Morta» o «Ceduta». Se lo storico contiene solo eventi automatici, il client legge gli eventi (massimo 250) e li elimina insieme alla scheda privata e alla proiezione pubblica in una transazione Firestore. Gli eventi sono normalmente append-only; le Rules consentono la cancellazione solo nello stesso commit che elimina il documento padre. Il salvataggio di una nuova osservazione aggiorna il padre e causa conflitto con una cancellazione concorrente. In presenza di troppi eventi, di un errore di rete o di una versione diversa, non viene effettuata alcuna eliminazione.

## Visibilità dei profili botanici

`plantProfiles.public` è inizialmente `false`: l'utente anonimo non può enumerare o leggere specie/cultivar registrate soltanto nell'inventario privato. La prima pubblicazione di un esemplare rende pubblico il relativo profilo botanico (`public=true`) nella stessa transazione; il catalogo anonimo legge soltanto `plantProfiles` filtrati per `public == true`. Il proprietario legge tutti i profili, inclusi quelli privati. Una volta pubblicato, il profilo generico rimane pubblico anche quando tutte le piante ritornano private; non contiene collegamenti all'inventario riservato, note o provenienza. Questo è un compromesso esplicito per mantenere storia botanica condivisa senza esporre esemplari non pubblicati.

Nel gestionale non è consentito registrare una voce di diario mentre la scheda dell'esemplare contiene modifiche non salvate. In caso contrario il timestamp di modifica concorrente del diario invaliderebbe la versione dell'editor e obbligherebbe a ricaricare perdendo la bozza. L'utente salva prima la scheda, poi registra il diario; entrambi i moduli mantengono gli input in caso di errore.
