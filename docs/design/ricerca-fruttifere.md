# Ricerca botanica e filtri climatici — Piante

**Decisione del prodotto:** dare priorità alle piante da frutto, mantenere facile la consultazione delle altre piante e consentire una ricerca più tollerante. **Stato:** candidatura da verificare, nessun dato reale migrato o modificato.

## Benchmark consultato il 2026-11-06

- [Vendita Piante Online](https://www.venditapianteonline.it/categoria-prodotto/orto-frutteto-cucina/piante-da-frutto/): filtri per resistenza al gelo con soglie in °C, esposizione, altezza, fogliame.
- [Ingegnoli](https://www.ingegnoli.it/ita/piante/piante-da-frutto): tipologie fruttifere, autofertilità, fruttificazione, forme nane e colonnari.
- [Promesse de Fleurs](https://www.promessedefleurs.it/alberi-da-frutto.html): resistenza al freddo, altezza adulta e adattamento al giardino.
- [Food Forest Nursery](https://www.foodforestnursery.com/shop/fruit-trees/): zone di rusticità, ore di freddo, impollinazione, epoca di raccolta, coltivazione in vaso.
- [RHS hardiness](https://www.rhs.org.uk/advice/rhs-hardiness-rating): fasce di rusticità indicative, fortemente influenzate dalle condizioni concrete.
- [UC IPM avocado](https://ipm.ucanr.edu/home-and-landscape/avocado-site-selection/): tolleranza diversa per cultivar, esposizione, durata del freddo e stato della pianta.
- [UCANR semenzali](https://ucanr.edu/county/cooperative-extension-ventura-county/growing-avocado-seed): da seme non si ottiene in generale un'identica varietà clonale.

Non copiare immagini, descrizioni o database dei vivai; i riferimenti sono spunti UX e di affidabilità delle informazioni.

## Classificazione

Gruppo principale, non esclusivamente botanico:
- **Piante da frutto** (priorità di ordinamento): agrumi, tropicali e subtropicali, mediterranee, temperate, piccoli frutti, altre fruttifere.
- **Orto e tuberi**: piante coltivate soprattutto per radici, tuberi o altri organi non-frutti.
- **Altre piante**: ornamentali, aromatiche, succulente non classificate fra le fruttifere e altre.

La **forma di crescita** è un asse indipendente (albero, arbusto, rampicante, erbacea, succulenta). Una succulenta può anche essere una fruttifera. `category` rimane il campo storico per retrocompatibilità; `plantGroup` e `fruitType` sono metadati nuovi facoltativi.

Esempi dalle conversazioni precedenti (non inventario live verificato):

| Pianta menzionata | Gruppo proposto | Tipo / forma | Cautela |
|---|---|---|---|
| Avocado da seme di un frutto Hass | Piante da frutto | Tropicali e subtropicali / albero | Non assegnare la cultivar Hass al semenzale senza conferma |
| Passiflora edulis | Piante da frutto | Tropicali e subtropicali / rampicante | Non confondere con altre Passiflora rustiche |
| Passiflora ligularis | Piante da frutto | Tropicali e subtropicali / rampicante | Specie distinta da edulis |
| Fico d'India (Opuntia) | Piante da frutto | Mediterranee / succulenta | Non inventare cultivar, pezzatura o dolcezza |
| Batata | Orto e tuberi | Erbacea | Parte raccolta: radice tuberizzata |
| Topinambur | Orto e tuberi | Erbacea | Parte raccolta: tubero |
| Aloe spp. | Altre piante | Succulenta | Identificazione e uso alimentare non accertati |
| Cotone | Altre piante | Erbacea / fibrosa | Capsula botanica non implica pianta fruttifera alimentare |

Queste specie sono state discusse nelle chat; non assumere che siano tutte oggi coltivate, vendute o pubblicate. Nessun documento Firestore viene creato automaticamente a partire dalle chat.

## Ricerca intelligente senza servizi esterni

La ricerca è locale sull'elenco già permesso dalle Firestore Rules (pubblico per `catalog`, privato per `privatePlants`). Funzioni pure in `src/catalog.js`: normalizzazione di maiuscole/accenti/apostrofi, nomi comuni e scientifici, sinonimi espliciti, ricerca multi-parola, refusi di distanza uno su termini lunghi e ordinamento per pertinenza. Le equivalenze sono conservative e non attribuiscono cultivar. Il campo `searchAliases` permette aggiunte curate manualmente.

Ricerca e filtri condividono funzioni pure. La vetrina aggiunge gruppo, tipo di fruttifera, categoria e temperatura minima, con URL condivisibile; l'inventario permette di cercare con la stessa logica, per gruppo e visibilità.

Nessuna chiamata a modelli AI, nessuna indicizzazione privata esterna, nessun nuovo servizio a pagamento.

## Impollinazione, raccolta e vaso

Questi tre filtri sono stati approvati come requisiti di prodotto, ma **non** devono essere compilati automaticamente in base al solo nome botanico.

- `pollination` opzionale: `Autofertile`, `Richiede impollinazione`, `Variabile`. Vuoto = sconosciuto. Non confondere autofertilità, tipo sessuale della pianta, impollinazione incrociata e capacità effettiva di allegagione. Per le piante da seme, non assumere la caratteristica della cultivar madre.
- `harvestMonths` opzionale: lista ordinata dei mesi da 1 a 12. È un calendario *indicativo* per il luogo di coltivazione, non una promessa di raccolta né il periodo di fioritura. Il filtro mostra solo schede che contengono esplicitamente il mese selezionato.
- `potSuitability` opzionale: `Adatta`, `Con accorgimenti`, `Non consigliata`. Vuoto = dato sconosciuto. Dimensioni del vaso, substrato, portainnesto, potatura e durata della coltivazione influiscono molto.

Riferimenti: [RHS su scelta alberi da frutto, autofertilità e gruppi di impollinazione](https://www.rhs.org.uk/fruit/fruit-trees/choosing-the-best); [RHS coltivazione fruttifere in vaso](https://www.rhs.org.uk/education-learning/school-gardening/resources/food-growing/growing-fruit-in-containers).

## Temperatura

`minColdC` opzionale numerico: **temperatura minima indicativa tollerabile in °C da pianta adulta, acclimatata e in piena terra durante un episodio breve**. Il filtro «Resiste almeno a -5 °C» include solo le schede con valore documentato minore o uguale a -5, non quelle con dato assente. Il valore 0 è valido e non equivale al dato mancante.

La temperatura non è una garanzia di sopravvivenza: cultivar, durata, vento, terreno, vaso, età e umidità cambiano la tolleranza. Separare in futuro rusticità della pianta, danni alla fioritura e ore di freddo necessarie alla fruttificazione: sono misure differenti. Non derivare automaticamente soglie dalla sola specie.

`coldSource` può contenere un URL HTTPS di riferimento e `coldNotes` una nota pubblica. L'amministratore deve verificare la fonte prima di attribuire una soglia, senza popolamenti automatici.

## Contratti Firestore e rilascio

`catalogProjection` copia solo i metadati pubblici consentiti; non copia `internalNotes`. La nuova allowlist in `firestore.rules` richiede numeri, stringhe, liste di mesi ed enum validi e continua a negare scritture anonime e letture private. I campi nuovi sono facoltativi, preservando le vecchie schede.

**CRITICAL:** le Rules live non sono aggiornate dalla pipeline Hosting. Se si distribuisse soltanto la nuova UI, i salvataggi di schede pubblicate fallirebbero, perché `catalogProjection` aggiunge campi non ammessi dalle vecchie Rules. Non eseguire merge/deploy Hosting prima di pianificare e verificare separatamente l'aggiornamento delle Rules su database reale, oppure implementare una fase compatibile senza nuovi campi.

I test emulator della PR provano soltanto il file Rules candidato, non lo stato live. Nessuna modifica o popolamento dei dati di produzione per testing.

## Verifica manuale necessaria

Viewport 320/360/390/768/1024+, filtri mobile espansi/chiusi, ricerca con sinonimi e refusi, assenza risultati, URL condiviso dopo reload/back, 0 °C, -5 °C, schede senza clima, autofertilità ignota, raccolta su più mesi, idoneità al vaso sconosciuta, filtri combinati, accessibilità keyboard, creazione e modifica admin senza perdita input, pubblicazione e rollback compatibili con Rules live. Nessuna garanzia E2E senza browser realmente usato.
