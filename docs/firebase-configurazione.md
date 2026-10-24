# Firebase — configurazione nota e verifiche aperte

Nota storica: inventario iniziale del 23 ottobre 2026 per il riavvio **sito web Piante (non PWA)**. Stato tecnico del repository aggiornato il 24 ottobre 2026. Questo documento conserva le informazioni di configurazione utili; **non** afferma che il provider Firebase sia stato verificato o modificato. Non contiene segreti.

## Identificativi e Hosting
- Progetto Firebase/GCP: `pianta-db` (presente anche in `.firebaserc`).
- Firebase Hosting site ID previsto: `piante`.
- Dominio desiderato: `https://piante.web.app`.
- Piano desiderato: Spark; piano effettivo e quote non verificati via provider.
- La vecchia `firebase.json` della PWA è stata rimossa. **L'attuale `firebase.json` è stato ricreato per il nuovo sito**, configura soltanto Firebase Hosting statico con `public=web`, sito `piante` e rewrite SPA. Questa configurazione GitHub **non è prova di deploy o di configurazione provider live**.
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
- Il codice contiene ora `profiles/{uid}`, `access_grants/{uid}`, `handles/{username}` e `public_gardens/{username}`. La pubblicazione è esplicita e usa batch atomici. Le Rules candidate sono sottoposte a test Firebase Emulator nella CI; **non** sono state pubblicate sul provider live.
- Restrizioni API key per referrer/API, IAM, App Check, indici e autorizzazioni effettive: **da verificare dal provider**.
- Firebase Storage non è integrato nel nuovo sito: il piano Spark non consente più l'accesso a Cloud Storage dal 3 febbraio 2026. Le fotografie destinate alla pubblicazione sono convertite in WebP localmente e possono essere caricate **manualmente** come asset Hosting pubblici; non sono protette dalle Rules Firestore.
- Firebase Analytics e Cloud Functions: non integrate nel vecchio repository; nessuna nuova attivazione o costo autorizzati.

## Confini di questa pulizia
- Eliminato soltanto il codice/versionamento della vecchia PWA nel repository `gernotfound/piante`.
- Non cancellati dati Firestore, account Firebase Auth, regole pubblicate, configurazioni OAuth, risorse Hosting o Storage.
- La configurazione precedente rimane recuperabile nella **cronologia Git** prima del commit di reset (HEAD precedente: `d385e6c6dda0bea18f5a53c54a2516e20789becf`).
- Il routing client `/login`, `/app`, `/:username` e `/:username/:plantSlug` è stato implementato nel repository. Mancano ancora configurazione Web Firebase, audit provider, browser test con Auth reale e distribuzione Hosting.

## Evidenze
- `GITHUB-OBSERVED`: repository, `.firebaserc`, vecchi file di configurazione e registro esterno fino al 23 ottobre 2026.
- `USER-SCREENSHOT` / `USER-REPORTED`: configurazione Firebase descritta nelle chat del progetto il 8 e 21 ottobre 2026.
- `PROVIDER-OBSERVED`: **nessuna verifica live Firebase compiuta** da questa implementazione. L'accesso ai provider live non è stato verificato; non dedurre che il sito pubblico utilizzi il codice corrente.

## Stato d'implementazione confermato su GitHub al 24 ottobre 2026

- `web/firebase-config.mjs` contiene ancora `apiKey` e `appId` vuoti per lo sviluppo locale. La nuova implementazione prova un *bootstrap automatico solo su* `https://piante.web.app` attraverso `/__/firebase/init.json`, con project ID rigidamente verificato. Questa capacità non è stata provata live: l'accesso Google non può ancora essere dichiarato operativo.
- `firestore.rules` è una candidata non distribuita; il codice `firebase.json` contiene volutamente soltanto Hosting.
- Il modello privato è riservato agli UID con `access_grants/{uid}.enabled == true`; il grant richiede un amministratore affidabile. Provider Auth Email/Password e Google, domini autorizzati e Rules live restano da verificare.
- Nessuna migrazione o cancellazione dati da vecchia Pianta, nessun deployment e nessun piano Blaze attivato durante lo sviluppo.
- I contratti operativi correnti sono in `AGENTS.md` e `.agents/rules/`. README intenzionalmente assente.

## 24 ottobre 2026 — revisione di LogBook e pre-bootstrap (solo codice)
- Esaminati LogBook e i suoi contratti Google popup, Firebase Web, CI e sicurezza. Adottati classificazione popup/cancellazione/network, fallback redirect, session fences e convalida stretta progetto/origine.
- Il nuovo bootstrap utilizza la configurazione pubblica fornita da Firebase Hosting sull'origine piante.web.app. I path riservati sono documentati ufficialmente: https://firebase.google.com/docs/hosting/reserved-urls . Nessuna API key/App ID o credenziale amministrativa è stata copiata da LogBook o da altri progetti.
- Nessuna verifica della risposta reale dell'endpoint, nessun deploy, nessuna modifica Auth o Firestore effettuata in questa modifica GitHub.
