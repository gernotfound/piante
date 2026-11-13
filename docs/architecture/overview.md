# Architettura — Piante

**Fonte:** repository. Per lo stato live fanno fede i provider e le verifiche effettive.

## Schema Cloudflare in preparazione (non distribuito)

- La migrazione architetturale Cloudflare è descritta nell'[EPIC #32](https://github.com/gernotfound/piante/issues/32), nel [contratto D1 Fresh Start](cloudflare-data-model.md) e nel [contratto API Workers candidato](cloudflare-api.md) (lettura pubblica, amministrazione non disponibile). Lo schema candidato è `cloudflare/migrations/0001_initial.sql` con test `tests/contracts/cloudflare-schema.test.js`.
- **Questa non è l'architettura live:** i paragrafi seguenti descrivono Firebase. Il nuovo D1 parte vuoto con una nuova identità amministrativa; non importa dati/account né mantiene adattamenti per versioni vecchie.
- La PR draft [#44](https://github.com/gernotfound/piante/pull/44) gestisce separatamente il contesto dell'account Cloudflare e l'hostname gratuito `https://piantee.califano-ger.workers.dev`, confermato dal proprietario ma non ancora creato o pubblicato. Nessun merge/deploy/risorsa esterna è implicito nell'aggiunta del modello SQL.

## Frontend Cloudflare candidato (non distribuito)

- `cloudflare/site/`: nuova vetrina anonima, indipendente dal vecchio `src/` Firebase; `scripts/build-cloudflare-site.mjs` produce `cloudflare/dist/`, separata dal `dist/` distribuito da Firebase. Nessun archivio privato, migrazione o login implementato.
- Il Worker `cloudflare/worker/index.js` fornisce solo catalogo pubblico da `public_catalog`; gestione privata negata. Contratti e test: [API Cloudflare](cloudflare-api.md), [D1](cloudflare-data-model.md), `tests/e2e/cloudflare-site.test.js`. Lo stato live resta Firebase: SQL/HTML/Worker candidati non sono un deploy.

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
- `privatePlants/{id}`: inventario riservato, note interne, provenienza, stato, lotto e altri metadati. Il codice breve `#` con sei caratteri maiuscoli/cifre viene generato automaticamente durante la creazione della scheda, prenotato nella stessa transazione in `specimenCodes/{code}` e salvato in `specimenCode`, immutabile una volta assegnato. Non è prevista alcuna attivazione manuale. Se una scheda storica senza codice viene modificata, il primo salvataggio le assegna un codice registrato senza alterare i dati esistenti. L'identità autorevole resta l'ID del documento e l'URL non cambia. Le prenotazioni non sono eliminate neppure quando viene cancellato un esemplare. L'editor preserva un gruppo botanico storico esplicito se la categoria non viene cambiata, evitando riclassificazioni involontarie.
- `plantProfiles/{id}`: schede condivise di specie e cultivar, sempre leggibili dal proprietario e pubblicamente consultabili solo dopo la prima pubblicazione (`public=true`); scrivibili solo dal proprietario. I documenti `catalog` e `privatePlants` possono referenziarle per ID. Il client unisce i dati alla lettura, senza migrazioni o fan-out: una correzione alle caratteristiche comuni modifica la vista di tutti gli esemplari collegati. Per le schede legacy senza ID di specie si tenta esclusivamente la corrispondenza esatta del nome comune. Una cultivar non viene inferita dal seme del suo frutto.
- `specimenCodes/{code}`: prenotazioni immutabili riservate al proprietario con riferimento `plantId`; create atomicamente con la scheda privata e, quando pubblicata, con la relativa proiezione.
- `seedLots/{id}`: lotti privati con nome, specie e provenienza; `privatePlants/{id}/events/{eventId}`: diario e storico immutabile delle operazioni, entrambi leggibili solo dal proprietario.
- `catalog/{id}`: proiezione dei soli campi pubblicabili. Le operazioni sulle raccolte private/pubbliche e sulle schede condivise coinvolte sono atomiche; l'editor conserva la versione caricata e blocca sovrascritture concorrenti.
- Firebase Authentication contiene password e sessioni. L'accesso al gestionale usa soltanto email e password: non esistono più nickname o alias di login nel frontend. Le raccolte legacy `adminProfiles` e `loginAliases` sono negate dalle Rules e non vanno trattate come dati di accesso attivi.

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

## Verifiche di coerenza dei moduli (audit 2026-11-12)

Il nome di una specie riconosciuta viene normalizzato alla denominazione canonica del relativo profilo, evitando che maiuscole o sinonimi rinominino automaticamente tutte le piante. I sinonimi ambigui non determinano collegamenti automatici. Quando una scheda e una bozza del diario sono compilate simultaneamente, il comando di salvataggio chiede conferma e registra entrambe le modifiche nella stessa transazione; un errore non cancella alcuna bozza. Due salvataggi concorrenti del diario sono bloccati a livello di interfaccia, conservando i controlli di versione Firestore. Il lotto riutilizzato rifiuta dati di semina/provenienza contrastanti senza cambiare l'inventario. Gli errori del listener dei profili pubblici e del catalogo vengono mostrati separatamente e non si nascondono a vicenda.
