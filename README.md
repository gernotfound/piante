# Piante — vetrina pubblica e gestionale privato

Sito statico responsive (HTML, CSS, JavaScript modulari) ospitato su **Firebase Hosting**. **Cloud Firestore** contiene dati pubblici e privati separati, mentre **Firebase Authentication** gestisce le password. Non è necessario attivare un server o un piano a pagamento.

## Sezioni

- **Home:** presentazione e anteprima delle piante pubblicate.
- **Piante:** catalogo pubblico con ricerca, filtri e schede.
- **Chi siamo / Contatti:** pagine informative, senza dati aziendali inventati.
- **Area riservata:** inventario, inserimento, modifica, pubblicazione, rimozione, configurazione del nome utente.

Un documento **privatePlants/{id}** contiene anche le note interne. Solo i campi della funzione `catalogProjection` in `src/domain.js` vengono copiati in **catalog/{id}** al momento della pubblicazione. La pubblicazione/rimozione avviene tramite un batch atomico.

## Configurazione iniziale (necessaria)

1. **Già completato:** è stata registrata l'app Web Firebase e la relativa configurazione pubblica è stata inserita in `src/config.js`. Questi parametri Web **non sono segreti**. Non inserire mai chiavi private, token o password nel repository.
2. Nella console abilita **Authentication > Sign-in method > Email/Password**. Crea **manualmente** il tuo utente amministratore in Authentication > Users. Non attivare la registrazione pubblica nell'interfaccia.
3. Copia il suo **UID** dalla schermata degli utenti. Crea in Firestore, tramite console con privilegi amministrativi, il documento **siteOwner/primary** con il campo stringa **uid** uguale all'UID di quell'utente. Non è possibile crearlo dall'app: è una protezione deliberata contro l'appropriazione del ruolo amministratore.
4. Crea il database **Cloud Firestore** se non è già presente. Pubblica le regole **firestore.rules** soltanto dopo aver controllato eventuali regole e dati già presenti: il deploy sostituisce le regole del database predefinito. Il file propone un modello **nuovo** e non migra raccolte precedenti.
5. Il primo accesso avviene con **email e password**. Nell'area riservata, apri **Impostazioni accesso** per assegnarti un **nome utente**: da quel momento puoi usarlo nel login al posto dell'email. La password resta sempre in Firebase Authentication, **mai in Firestore**.
6. In Authentication > Settings > Authorized domains verifica che il dominio Firebase Hosting e gli eventuali domini personalizzati siano autorizzati.

> La configurazione Firebase è già presente in `src/config.js`. Il documento `siteOwner/primary` e le regole Firestore sono stati configurati tramite console dall'utente; il funzionamento sul progetto reale deve ancora essere verificato con accesso e operazioni nel browser.

## Pubblicazione diretta automatica — `piantee.web.app`

Il sito Hosting `piantee` risulta creato nella console Firebase e il dominio è stato autorizzato in Authentication. Il target `piantee` è definito in `.firebaserc` e referenziato in `firebase.json`, separato dall'ID progetto Firebase `piante-a617e`.

Il workflow `.github/workflows/deploy-production.yml` esegue **solo** su push al branch `main` (o avvio manuale `workflow_dispatch`). Prima del deploy sul canale `live` esegue controllo di sintassi, test unitari e test regole Firestore via emulatore. Non crea canali di anteprima. Un commit su un branch di lavoro **non** viene pubblicato; diventa operativo dopo il merge su `main`.

### Credenziale richiesta — configurazione una tantum

Il deploy richiede che GitHub sia autorizzato a pubblicare nel progetto Google Cloud/Firebase. Creare un account di servizio dedicato in Google Cloud IAM con i ruoli:
- **Firebase Hosting Admin** (`roles/firebasehosting.admin`)
- **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`), richiesto dalla Firebase CLI.

La configurazione corrente è esclusivamente Hosting statico, senza preview channel, Cloud Run o Cloud Functions; per questo non sono necessari i ruoli di amministrazione Firebase Authentication o Cloud Run Viewer. Non assegnare il ruolo Owner/Editor al service account.

Generare una **chiave JSON** per questo account di servizio e inserirne **l'intero contenuto** come secret GitHub di repository con nome esatto `FIREBASE_SERVICE_ACCOUNT` in **Settings > Secrets and variables > Actions > New repository secret**. **Non inserire mai la chiave nel codice, in un issue, in un commit o in chat**. La chiave deve restare privata; se esposta, revocarla immediatamente in Google Cloud. Un'alternativa più avanzata che evita chiavi permanenti è la federazione OIDC/Workload Identity Federation.

Senza il secret, il workflow fallisce deliberatamente prima del deploy. Il collegamento del solo SDK Firebase Web (`apiKey`/`appId`) non autorizza a pubblicare su Hosting.

### Prima attivazione

1. Controllare la correttezza del documento Firestore `siteOwner/primary`, delle regole già pubblicate e della configurazione Firebase Authentication; non pubblicare automaticamente le regole dal workflow.
2. Configurare il secret GitHub `FIREBASE_SERVICE_ACCOUNT` con account dedicato e permessi minimi indicati sopra.
3. Verificare `main` e le modifiche nella pull request; la PR resta **draft** finché non si decide di integrarla.
4. Dopo l'integrazione su `main`, la prima esecuzione del workflow avvia il deploy **direttamente sul sito pubblico** `https://piantee.web.app` (senza preview). Aprire **GitHub > Actions > Deploy in produzione su piantee.web.app** per verificare l'esito.
5. Accedere con email/password, verificare autorizzazioni, consultazione catalogo e un salvataggio di prova; prima del rilascio non è stata eseguita alcuna verifica nel browser sul Firebase reale.

Per i successivi aggiornamenti: basta inserire il codice verificato su `main`; GitHub Actions ricontrolla e distribuisce in produzione. Se i test falliscono, il sito online non viene sostituito. Il rollback del solo Hosting è disponibile dalla Firebase Console in caso di regressioni visibili sul sito.

Per un deploy manuale di emergenza, usando la stessa configurazione del repository in un ambiente già autenticato con privilegi di deploy:

```sh
npx firebase deploy --only hosting:piantee --project piante-a617e
```

Il comando agisce soltanto sul sito Hosting `piantee`, non modifica le regole Firestore.

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

```sh
npm install
npm run check
npm test
npm run test:rules
```

I test unitari coprono normalizzazione alias, URL immagini, escaping HTML, separazione delle note interne e validazione. I test Firestore con emulatore verificano accesso pubblico, account non proprietario, protezione UID, pubblicazione atomica, blocco dei campi interni e alias. La CI esegue entrambi. Rimangono necessari i test end-to-end sul browser e la verifica della configurazione del progetto reale.
