# Firebase — configurazione nota e verifiche aperte

Aggiornato il 23 ottobre 2026 per il riavvio **sito web Piante (non PWA)**. Questo documento conserva le informazioni di configurazione utili; **non** afferma che il provider Firebase sia stato verificato o modificato. Non contiene segreti.

## Identificativi e Hosting
- Progetto Firebase/GCP: `pianta-db` (presente anche in `.firebaserc`).
- Firebase Hosting site ID previsto: `piante`.
- Dominio desiderato: `https://piante.web.app`.
- Piano desiderato: Spark; piano effettivo e quote non verificati via provider.
- La vecchia `firebase.json` della PWA, con rewrite a `/index.html`, regole CSP e cache per `sw.js` e manifest, è stata rimossa dal nuovo repository: **non era una configurazione verificata per il nuovo sito**. Ricreare la configurazione di Hosting durante l'implementazione.
- Nessun deployment Firebase eseguito da questa pulizia.

## Autenticazione e OAuth
- Prodotto desiderato: **solo login Google** su `/login`; l'apertura degli account e le eventuali restrizioni di accesso andranno definite e testate prima del rilascio.
- Stato storico riferito dall'utente (21 ottobre 2026): provider **Google** ed **Email/Password** abilitati nel progetto Firebase, con un account di prova. Non verificato direttamente sul provider. Disabilitare Email/Password richiederà un intervento consapevole sulla Console/API prima del lancio se ancora attivo.
- Screenshot storico dei domini autorizzati Firebase Auth (8 ottobre 2026): `localhost`, `pianta-db.firebaseapp.com`, `pianta-db.web.app`, `pianta-gnf.vercel.app`, `piante.web.app`. Stato attuale **da verificare** prima di rimuovere domini legacy.
- Redirect OAuth previsto: `https://piante.web.app/__/auth/handler`.
- Origine JavaScript OAuth `https://piante.web.app`: aggiunta dichiarata dall'utente (8 ottobre 2026), funzionamento **non verificato**.
- Variabili della Firebase Web App da configurare nel nuovo sito: API key web, App ID, Project ID, Auth Domain. I valori sensibili/non necessari non sono presenti nel repository. L'API key web non è un segreto sostitutivo delle Security Rules.

## Firestore e altri servizi
- Cloud Firestore: database `(default)`, regione `europe-west12` secondo screenshot del 21 ottobre 2026; non verificato via provider.
- Nel database erano visibili documenti nel namespace precedente `users`, con sottocollezioni `plants` e `images`. Nessun dato di Pianta verrà importato nel nuovo sito.
- Le Rules osservate/riferite dall'utente riguardavano il precedente namespace `users/{uid}`. Le Rules di laboratorio PWA non erano distribuite. **Le Rules live non sono state lette né modificate** con questa operazione.
- Futuro modello: documenti privati accessibili solo al proprietario e documenti pubblici separati, con pubblicazione esplicita dei soli campi selezionati. Validare le Security Rules tramite Emulator prima di qualsiasi deploy.
- Restrizioni API key per referrer/API, IAM, App Check, indici e autorizzazioni effettive: **da verificare dal provider**.
- Firebase Storage: non integrato nel vecchio prodotto, futura gestione delle fotografie da progettare e verificare.
- Firebase Analytics e Cloud Functions: non integrate nel vecchio repository; nessuna nuova attivazione o costo autorizzati.

## Confini di questa pulizia
- Eliminato soltanto il codice/versionamento della vecchia PWA nel repository `gernotfound/piante`.
- Non cancellati dati Firestore, account Firebase Auth, regole pubblicate, configurazioni OAuth, risorse Hosting o Storage.
- La configurazione precedente rimane recuperabile nella **cronologia Git** prima del commit di reset (HEAD precedente: `d385e6c6dda0bea18f5a53c54a2516e20789becf`).
- Il nuovo sito avrà percorsi `/login`, `/app`, `/:username` e `/:username/:plantSlug`; routing e distribuzione sono ancora da implementare.

## Evidenze
- `GITHUB-OBSERVED`: repository, `.firebaserc`, vecchi file di configurazione e registro esterno fino al 23 ottobre 2026.
- `USER-SCREENSHOT` / `USER-REPORTED`: configurazione Firebase descritta nelle chat del progetto il 8 e 21 ottobre 2026.
- `PROVIDER-OBSERVED`: **nessuna verifica live Firebase eseguita** in questo reset.
