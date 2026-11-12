# Firebase: confini dei dati e dei deploy

**Autorità:** [AGENTS.md](../../AGENTS.md). **Quando leggere:** Auth, Firestore, pubblicazione selettiva, Firebase Hosting, accesso amministratore.

## Client e autorizzazione

La configurazione Web in `src/config.js` (`apiKey`, `authDomain`, `projectId`, `appId` ecc.) è pubblica e NON autentica un deploy o un amministratore.

- Le password stanno in Firebase Authentication, non in Firestore.
- Il proprietario è riconosciuto quando `request.auth.uid` corrisponde al campo stringa `uid` del documento `siteOwner/primary`. Solo la console con accesso amministrativo deve poter modificare quel documento; le Rules lo proteggono dalla scrittura client.
- Il primo login si effettua con email/password. Gli alias in `loginAliases` servono a risolvere email, NON concedono privilegi. La lettura puntuale pubblica di un alias può esporre l'email associata: non considerarla privata.
- `privatePlants` contiene anche `internalNotes`; `catalog` contiene soltanto i campi di `catalogProjection` (vedere `src/domain.js`). Un documento non pubblicato non deve comparire in `catalog`. Le informazioni pubblicabili su rusticità, impollinazione, raccolta, forma di crescita e sinonimi sono facoltative: non inferire valori sconosciuti. `minColdC: null` nella scheda privata indica la cancellazione di una vecchia soglia e viene omesso dalla proiezione pubblica.
- Il client usa transazioni Firestore per modificare o eliminare schede, verificando che la versione letta nell'editor sia ancora attuale; copia privata e proiezione pubblica vengono aggiornate o rimosse atomicamente. Non sostituire le transazioni con scritture non condizionali: eliminazioni e cambio visibilità devono restare coerenti.

## Sicurezza e test

- Test `tests/unit/domain.test.js` e `tests/unit/search-filters.test.js` per validazione, ricerca e proiezione; test `tests/integration/rules.test.js` e `tests/integration/plant-store.test.js` sull'emulatore Firestore; `tests/e2e/browser-e2e.test.js` sui due emulatori e Chrome. Dopo cambiamenti a auth/Rules pubblicazione, aggiungere test pertinenti. La CI del candidato non dimostra l'applicazione delle Rules live.
- Non dedurre che Rules siano pubblicate perché un file esiste o i test passano. La console Firebase costituisce un sistema live distinto; anche le dichiarazioni dell'utente vanno registrate come tali.
- Per modifiche alle Rules, confrontare database e collezioni reali. Un deploy Rules sovrascrive la policy per il database configurato e non è incluso nel workflow Hosting.
- I record `siteOwner`, il catalogo e gli alias sono dati di produzione: non eliminarli, reimpostarli o seminarli automaticamente durante un test.

## Hosting

La produzione pubblica è `https://piantee.web.app`, site ID `piantee`. Il progetto Google Cloud/Firebase è `piante-a617e` (identificatori diversi). Si distribuisce da GitHub Actions quando viene aggiornato `main`, solo dopo i controlli, senza canali preview.

Il deployer Hosting mantiene soltanto i propri privilegi minimi. Il workflow `deploy-firestore-rules.yml` usa un pool WIF e un service account separati, riconcilia soltanto le Rules di `(default)` dopo la CI di main e verifica che la policy live corrisponda a una versione approvata nella storia Git prima di pubblicare. Rilegge la release e attende fino a 10 minuti se cambia. Hosting (`deploy-production.yml`) è attivato soltanto dopo il successo Firestore sullo stesso SHA. Gli indici e i dati non sono nel perimetro. Il [runbook](../../docs/operations/firebase-hosting-runbook.md) descrive setup, gate e rollback.
