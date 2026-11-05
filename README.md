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

> La configurazione Firebase è già presente in `src/config.js`. L'accesso non funzionerà finché l'UID amministratore non sarà salvato in `siteOwner/primary` e le regole Firestore non saranno verificate e attivate.

## Pubblicazione

Da un ambiente con Node.js e Firebase CLI installata:

```sh
npm install
npm run check
npm test
npm run test:rules
npx firebase login
npx firebase deploy --only hosting,firestore:rules
```

Questi comandi vanno eseguiti **dopo** aver creato l'account admin e verificato le regole. L'URL di Hosting desiderato è `https://piantee.web.app`: per ottenerlo occorre **creare in Firebase Hosting un sito con SITE_ID `piantee`** (se disponibile) e **configurare il deploy su quel sito**. Il sito predefinito del progetto, quando creato con l'ID del progetto, usa invece `https://piante-a617e.web.app`. Non eseguire il deploy finché il target Hosting non è stato verificato e configurato.

**Alternative:** pubblicare le regole dalla console (scheda Regole) e poi eseguire `firebase deploy --only hosting`. In seguito si può configurare `firebase init hosting:github` per le anteprime PR e il deploy tramite GitHub Actions; questa repository esegue per ora soltanto le verifiche CI, **non** effettua deploy automatici.

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
