# Frontend Piante — visual design Mobile First

**Decisione di prodotto:** vivaio commerciale senza checkout. Il catalogo presenta piante, caratteristiche ed eventuali valori di prezzo/disponibilità registrati; nessun acquisto o pagamento è implementato. Non mostrare recapiti, certificazioni o promesse logistiche non confermate.

## Palette e tipografia

| Ruolo | Token CSS | Colore |
|---|---|---|
| Primario e CTA | `--forest` | `#173B2D` |
| Secondario | `--leaf` | `#4D7951` |
| Sfondo | `--paper` | `#F7F8F3` |
| Evidenza tenue | `--sage` | `#E3EADC` |
| Accento | `--gold` | `#C99C52` |

DM Sans è usato nei controlli e nel testo; Playfair Display nei titoli editoriali. Entrambi hanno fallback di sistema. La fotografia viene da URL HTTPS registrati dall'amministratore: niente immagini finte di prodotti.

## Strategia responsive

- **Base da 320 CSS px**, una colonna nei moduli, nessuna larghezza minima imposta al documento; blocchi touch con altezza generalmente almeno 44 CSS px e input da 16 px per prevenire lo zoom involontario di Safari.
- **380 px:** griglia prodotto 2 colonne dove i contenuti possono ancora essere leggibili.
- **600 px:** più spazio, forme a due colonne, categorie in quattro colonne.
- **760 px:** menu orizzontale, filtri fissi del catalogo, prodotto in due colonne.
- **1000 px:** sidebar del gestionale e inventario tabellare. Sotto, barra inferiore a quattro destinazioni con attenzione alla safe area.
- Layout non dipendenti da hover, immagini con fallback, stato vuoto reale, preferenza riduzione delle animazioni rispettata. Nei browser senza CSS Grid il contenuto resta impilabile, ma richiede verifica manuale.

I breakpoint seguono la larghezza utile, non modelli o produttori di smartphone. Verificare schermi con zoom testo al 200%, tastiera virtuale aperta, rotazione e viewport di altezza limitata.

## Navigazione e dati

- La vetrina ha Home, Catalogo, Il vivaio e Contatti. Le tessere delle categorie collegano a `/piante?categoria=...` (condivisione/refresh preservano la categoria).
- Ricerca e filtri del catalogo operano solo sui documenti già pubblici in `catalog`. Il prezzo e la disponibilità compaiono soltanto quando presenti nei dati, senza interpretare testo libero come quantità o stati certificati.
- La dashboard mostra totale, pubblicate, private ed elementi modificati di recente. La lista non introduce nuove raccolte o scritture.
- Il gestionale mantiene l'invariante `privatePlants` / `catalogProjection`: salvare o eliminare una pianta usa una transazione atomica che verifica la versione aperta nell'editor; una seconda scheda non può sovrascrivere la prima senza ricaricare.
- In un editor con modifiche, la navigazione chiede conferma e gli snapshot Firestore non rigenerano il form. Su conflitto i dati compilati restano nel modulo e compare «Ricarica la scheda» (con conferma prima di scartare le modifiche). Durante una scrittura i controlli sono disabilitati e la navigazione interna bloccata. Anche i moduli di login/impostazioni e le ricerche non ancora applicate sono preservati dai ridisegni causati dagli snapshot e dall'inizializzazione Auth sulle pagine pubbliche; il login compare soltanto quando la verifica iniziale della sessione è terminata. Non esiste salvataggio automatico.

## Supporto dei dispositivi più vecchi

L'obiettivo di layout copre anche smartphone intorno a 320 px diffusi nell'ultimo decennio, **non garantisce che le versioni originali dei browser del 2016 eseguano Firebase**. Il codice corrente, e soprattutto Firebase Web SDK, richiedono caratteristiche moderne: iOS Safari anteriori a 13.4 non supportano ad esempio `?.`. È presente un messaggio testuale di fallback se l'app non si avvia; per garantire funzionalità su sistemi operativi non aggiornabili serve una decisione separata sulla compatibilità e una strategia di build/transpiling verificata contro l'SDK, senza sostituirlo con versioni insicure.

## Verifica del candidato

- Sintassi e filtri puri: `npm run check`, `npm test`.
- Rules: `npm run test:rules`. Il redesign non pubblica Rules.
- Test manuali prima di rilasciare: 320/360/390/430/768/1024/1440 CSS px, orientamento, zoom testo, tastiera; navigazione, menu, filtri, schede vuote e con foto, URL categoria con reload, bottone Torna, sidebar/bottom nav, editor con modifiche non salvate, salvataggio successo/fallimento e logout.
- I test CI includono operazioni atomiche con Firestore Emulator e un percorso browser E2E con Auth/Firestore Emulator (login, modifica concorrente, recupero, eliminazione, logout). Chrome verifica overflow della vetrina a 320, 360, 390, 430, 768, 1024 e 1440 CSS px, oltre ai percorsi amministrativi e alla navigazione mobile/desktop a 320, 390, 768, 1024 e 1440 px, usando una configurazione Firebase fittizia; non interroga l'inventario reale. Non sostituisce il collaudo su dispositivi fisici (tastiera virtuale, zoom, rotazione, lettori di schermo). Il deploy Hosting avviene solo con merge su `main`, non dalla PR.
