# Piante — vetrina pubblica e gestionale privato

Sito statico Mobile First (HTML, CSS, JavaScript modulari) ospitato su **Firebase Hosting**. **Cloud Firestore** contiene dati pubblici e privati separati, mentre **Firebase Authentication** gestisce le password. Non è necessario attivare un server o un piano a pagamento.

Per lavorare nel repository leggere [AGENTS.md](AGENTS.md); per lo stato delle configurazioni live seguire [registro servizi esterni](docs/operations/external-services-register.md) e [runbook Hosting](docs/operations/firebase-hosting-runbook.md). La documentazione distingue configurazione versionata, dichiarazioni del proprietario e verifiche live.

## Sezioni

- **Home:** presentazione commerciale, categorie e anteprima delle piante pubblicate.
- **Catalogo:** ricerca, filtri per categoria e schede botaniche con disponibilità e prezzi solo quando registrati.
- **Chi siamo / Contatti:** pagine informative, senza dati aziendali inventati.
- **Area riservata:** dashboard, inventario filtrabile, moduli a sezioni, pubblicazione, rimozione e configurazione del nome utente. Sidebar desktop e navigazione inferiore mobile.

Il design usa la palette botanico-commerciale approvata e parte da viewport di 320 px. La strategia, le verifiche mobile e i limiti dei browser datati sono documentati in [Frontend Mobile First](docs/design/mobile-first.md). Non sono presenti carrello o pagamenti.

Un documento **privatePlants/{id}** contiene anche le note interne. Solo i campi della funzione `catalogProjection` in `src/domain.js` vengono copiati in **catalog/{id}** al momento della pubblicazione. Le modifiche e le rimozioni usano transazioni Firestore: se la scheda è cambiata da un'altra sessione, l'editor blocca la scrittura e conserva i campi compilati fino alla scelta esplicita di ricaricare. Inventario e catalogo restano atomici.

## Configurazione iniziale (necessaria)

1. **Già completato:** è stata registrata l'app Web Firebase e la relativa configurazione pubblica è stata inserita in `src/config.js`. Questi parametri Web **non sono segreti**. Non inserire mai chiavi private, token o password nel repository.
2. Nella console abilita **Authentication > Sign-in method > Email/Password**. Crea **manualmente** il tuo utente amministratore in Authentication > Users. Non attivare la registrazione pubblica nell'interfaccia.
3. Copia il suo **UID** dalla schermata degli utenti. Crea in Firestore, tramite console con privilegi amministrativi, il documento **siteOwner/primary** con il campo stringa **uid** uguale all'UID di quell'utente. Non è possibile crearlo dall'app: è una protezione deliberata contro l'appropriazione del ruolo amministratore.
4. Crea il database **Cloud Firestore** se non è già presente. Pubblica le regole **firestore.rules** soltanto dopo aver controllato eventuali regole e dati già presenti: il deploy sostituisce le regole del database predefinito. Il file propone un modello **nuovo** e non migra raccolte precedenti.
5. Il primo accesso avviene con **email e password**. Nell'area riservata, apri **Impostazioni accesso** per assegnarti un **nome utente**: da quel momento puoi usarlo nel login al posto dell'email. La password resta sempre in Firebase Authentication, **mai in Firestore**.
6. In Authentication > Settings > Authorized domains verifica che il dominio Firebase Hosting e gli eventuali domini personalizzati siano autorizzati.

> La configurazione Firebase è già presente in `src/config.js`. Il documento `siteOwner/primary` e le regole Firestore sono stati configurati tramite console dall'utente; il funzionamento sul progetto reale deve ancora essere verificato con accesso e operazioni nel browser.

## Pubblicazione automatica diretta — `piantee.web.app`

La CI `.github/workflows/ci.yml` verifica sintassi, test unitari, Firestore Emulator, browser E2E isolato e CodeQL su `main`. Dopo `Canonical Verification` riuscita, `.github/workflows/deploy-firestore-rules.yml` riconcilia le Rules del database `(default)` e ne verifica la release attiva. Solo dopo il suo successo `.github/workflows/deploy-production.yml` pubblica **il target Hosting `piantee`**. Non ci sono anteprime PR né deploy automatici di dati o indici.

Il collegamento a Google Cloud usa **Workload Identity Federation (WIF)**, senza chiavi JSON permanenti, con identità distinte per Firestore Rules e Hosting. I workflow richiedono le repository variables `GCP_FIRESTORE_WORKLOAD_IDENTITY_PROVIDER` e `GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT` per le Rules, oltre a `GCP_WORKLOAD_IDENTITY_PROVIDER` e `GCP_FIREBASE_DEPLOY_SERVICE_ACCOUNT` per Hosting. Le identità e i privilegi effettivi devono essere verificati nel provider.

La configurazione passo per passo, le autorizzazioni minime, i controlli e il rollback sono nel [runbook Firebase Hosting](docs/operations/firebase-hosting-runbook.md). Le conferme e le verifiche mancanti sono nel [registro dei servizi esterni](docs/operations/external-services-register.md).

**Stato al 2026-11-05:** la prima versione è stata integrata in `main` con la PR #1. L'autenticazione GitHub→Google Cloud tramite WIF è riuscita, ma il primo deploy live ([Actions #42100963907](https://github.com/gernotfound/piante/actions/runs/42100963907)) si è fermato su una lettura Service Usage con HTTP 403. Il proprietario ha aggiunto **Service Usage Viewer** e il successivo [run #42102052951](https://github.com/gernotfound/piante/actions/runs/42102052951) ha pubblicato correttamente il sito Hosting e verificato l'HTTP del root. Login, dati e operazioni del gestionale richiedono ancora collaudo manuale sul browser.

## Icona del sito e anteprime dei collegamenti

Il sito usa l'avocado cartoon approvato come favicon vettoriale (`favicon.svg`), con `favicon.ico` e PNG di fallback per i browser. Non prevede installazione come app, manifest o service worker.

I metadati Open Graph e Twitter Card sono presenti nell'HTML iniziale; l'immagine generica `social-preview-v1.png` (1200×630) viene servita pubblicamente da Hosting per anteprime su WhatsApp e altri social. Poiché le route del catalogo sono gestite dal client e Hosting risponde con lo stesso `index.html`, anche i link alle singole piante mostrano l'anteprima generale: non esistono attualmente metadati specifici per pianta. Eventuali cache esterne delle anteprime non sono controllabili dal sito.

## Foto e piano gratuito

Su Spark, **Cloud Storage for Firebase non è accessibile**: dal 3 febbraio 2026 richiede Blaze. Il modulo della pianta accetta quindi URL **HTTPS** di foto legittimamente ospitate altrove, senza caricamento di immagini nel database. Le fotografie devono avere una URL diretta accessibile pubblicamente. In una fase successiva si potrà usare Storage con Blaze oppure un provider d'immagini alternativo.

## Sicurezza, dati e limiti

- Gli accessi a Firestore sono disciplinati dalle regole, **non** dalla sola interfaccia.
- Solo l'UID di **siteOwner/primary** può leggere le piante private e modificare il catalogo.
- Il catalogo pubblico è interrogabile da chiunque.
- La risoluzione nome utente → email è pubblica per alias esatto; non consente elenchi, ma chi conosce un alias può risalire all'email associata. Per non esporla, puoi effettuare l'accesso soltanto con email e non creare un alias.
- Le immagini esterne possono essere non disponibili o imporre limiti: il layout visualizza un segnaposto.
- I campi `prezzo` e `disponibilità` sono informativi: il sito non gestisce pagamenti né ordini.
- La CLI, la configurazione della console, la verifica delle regole rispetto al database reale e i test end-to-end nel browser sono ancora necessari prima di considerare pronto il rilascio in produzione.

## Test

Per i test locali serve **Node.js 24.12.0 o superiore**, coerentemente con i requisiti delle dipendenze Firebase.

```sh
npm install
npm run check
npm test
npm run test:rules
npx playwright install chromium # Solo su PC senza Chrome configurato per i test
npm run test:browser
```

I test unitari coprono normalizzazione alias, URL immagini, escaping HTML, separazione delle note interne e validazione. I test Firestore con emulatore verificano accesso pubblico, account non proprietario, protezione UID, creazione/aggiornamento/pubblicazione/rimozione atomici, conflitti tra editor, blocco dei campi interni e alias. La CI include inoltre Chrome in modalità automatizzata, con Firebase Auth e Firestore Emulator e una configurazione locale fittizia: verifica login, creazione/pubblicazione, modifiche concorrenti, recupero del modulo, eliminazione, logout e overflow a più viewport. Non scrive dati nel progetto reale. Rimangono necessari i collaudi su dispositivi effettivi e la verifica della configurazione del progetto reale.
