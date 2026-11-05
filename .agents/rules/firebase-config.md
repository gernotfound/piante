# Firebase: confini dei dati e dei deploy

**Autorità:** [AGENTS.md](../../AGENTS.md). **Quando leggere:** Auth, Firestore, pubblicazione selettiva, Firebase Hosting, accesso amministratore.

## Client e autorizzazione

La configurazione Web in `src/config.js` (`apiKey`, `authDomain`, `projectId`, `appId` ecc.) è pubblica e NON autentica un deploy o un amministratore.

- Le password stanno in Firebase Authentication, non in Firestore.
- Il proprietario è riconosciuto quando `request.auth.uid` corrisponde al campo stringa `uid` del documento `siteOwner/primary`. Solo la console con accesso amministrativo deve poter modificare quel documento; le Rules lo proteggono dalla scrittura client.
- Il primo login si effettua con email/password. Gli alias in `loginAliases` servono a risolvere email, NON concedono privilegi. La lettura puntuale pubblica di un alias può esporre l'email associata: non considerarla privata.
- `privatePlants` contiene anche `internalNotes`; `catalog` contiene soltanto i campi di `catalogProjection` (vedere `src/domain.js`). Un documento non pubblicato non deve comparire in `catalog`.
- Il client usa batch Firestore per aggiornare la copia privata e quella pubblica come una sola operazione; mantenere coerenza anche nei casi di delete e cambio visibilità.

## Sicurezza e test

- Test `tests/domain.test.js` per validazione e proiezione; test `tests/rules.test.js` contro emulatore Firestore. Dopo cambiamenti a auth/Rules pubblicazione, aggiungere test pertinenti.
- Non dedurre che Rules siano pubblicate perché un file esiste o i test passano. La console Firebase costituisce un sistema live distinto; anche le dichiarazioni dell'utente vanno registrate come tali.
- Per modifiche alle Rules, confrontare database e collezioni reali. Un deploy Rules sovrascrive la policy per il database configurato e non è incluso nel workflow Hosting.
- I record `siteOwner`, il catalogo e gli alias sono dati di produzione: non eliminarli, reimpostarli o seminarli automaticamente durante un test.

## Hosting

La produzione pubblica è `https://piantee.web.app`, site ID `piantee`. Il progetto Google Cloud/Firebase è `piante-a617e` (identificatori diversi). Si distribuisce da GitHub Actions quando viene aggiornato `main`, solo dopo i controlli, senza canali preview.

Il deployer deve autenticarsi via WIF e avere privilegi Hosting minimi, non privilegi di gestione Firestore. Il [runbook](../../docs/operations/firebase-hosting-runbook.md) descrive setup, gate e rollback.
