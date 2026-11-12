# Firebase: confini dei dati e dei deploy

**Autorità:** [AGENTS.md](../../AGENTS.md). **Quando leggere:** Auth, Firestore, pubblicazione selettiva, Firebase Hosting, accesso amministratore.

## Client e autorizzazione

La configurazione Web in `src/config.js` (`apiKey`, `authDomain`, `projectId`, `appId` ecc.) è pubblica e NON autentica un deploy o un amministratore.

- Le password stanno in Firebase Authentication, non in Firestore.
- Il proprietario è riconosciuto quando `request.auth.uid` corrisponde al campo stringa `uid` del documento `siteOwner/primary`. Solo la console con accesso amministrativo deve poter modificare quel documento; le Rules lo proteggono dalla scrittura client.
- L'accesso avviene esclusivamente tramite email/password in Firebase Authentication. I nickname sono stati rimossi: le collezioni legacy `loginAliases` e `adminProfiles` non sono più accessibili via client, neppure dal proprietario. Eventuali record storici richiedono pulizia amministrativa esplicita, non una cancellazione automatica.
- `privatePlants` contiene anche `internalNotes`; `catalog` contiene soltanto i campi di `catalogProjection` (vedere `src/domain.js`). `plantProfiles` è leggibile anonimamente solo per documenti `public == true` e deve contenere soltanto attributi botanici condivisi, mai provenienza privata o dati di un esemplare. `seedLots`, `specimenCodes` e `privatePlants/{id}/events` sono solo proprietario. Un documento non pubblicato non deve comparire in `catalog`. Le informazioni pubblicabili su rusticità, impollinazione, raccolta, forma di crescita e sinonimi sono facoltative: non inferire valori sconosciuti. `minColdC: null` nella scheda privata indica la cancellazione di una vecchia soglia e viene omesso dalla proiezione pubblica.
- Il client usa transazioni Firestore per modificare o eliminare schede, verificando che la versione letta nell'editor sia ancora attuale; copia privata e proiezione pubblica vengono aggiornate o rimosse atomicamente. Non sostituire le transazioni con scritture non condizionali: eliminazioni e cambio visibilità devono restare coerenti.

## Sicurezza e test

- Test `tests/unit/domain.test.js` e `tests/unit/search-filters.test.js` per validazione, ricerca e proiezione; test `tests/integration/rules.test.js`, `tests/integration/plant-store.test.js` e `tests/integration/specimen-codes.test.js` sull'emulatore Firestore; `tests/e2e/browser-e2e.test.js` sui due emulatori e Chrome. Dopo cambiamenti a auth/Rules pubblicazione, aggiungere test pertinenti. La CI del candidato non dimostra l'applicazione delle Rules live.
- Non dedurre che Rules siano pubblicate perché un file esiste o i test passano. La console Firebase costituisce un sistema live distinto; anche le dichiarazioni dell'utente vanno registrate come tali.
- Per modifiche alle Rules, confrontare database e collezioni reali. Un deploy Rules sovrascrive la policy per il database configurato e non è incluso nel workflow Hosting.
- Il documento `siteOwner/primary`, il catalogo e gli eventuali record legacy di nickname sono dati di produzione: non eliminarli, reimpostarli o seminarli automaticamente durante un test. Un reset dei dati del vivaio non deve eliminare l'utente Firebase Authentication né `siteOwner/primary`: l'UID è il vincolo di autorizzazione.

## Hosting

La produzione pubblica è `https://piantee.web.app`, site ID `piantee`. Hosting legge esclusivamente `dist/`, rigenerata da `npm run build` tramite allowlist; test, documenti, configurazioni operative e Security Rules non sono asset del sito. Il progetto Google Cloud/Firebase è `piante-a617e` (identificatori diversi). Si distribuisce da GitHub Actions quando viene aggiornato `main`, solo dopo i controlli, senza canali preview.

Il deployer Hosting mantiene soltanto i propri privilegi minimi. Il workflow `deploy-firestore-rules.yml` usa un pool WIF e un service account separati, riconcilia soltanto le Rules di `(default)` dopo la CI di main e verifica che la policy live corrisponda a una versione approvata nella storia Git prima di pubblicare. Rilegge la release e attende fino a 10 minuti se cambia. Hosting (`deploy-production.yml`) è attivato soltanto dopo il successo Firestore sullo stesso SHA. Gli indici e i dati non sono nel perimetro. Il [runbook](../../docs/operations/firebase-hosting-runbook.md) descrive setup, gate e rollback.

## Schede botaniche condivise

Una specie e le sue cultivar sono documenti distinti in `plantProfiles`; i riferimenti stabili consentono di applicare i cambiamenti anche ai vecchi esemplari senza scritture massive. Per i record legacy senza `speciesId`, il collegamento è soltanto virtuale e basato sull’esatta corrispondenza del nome comune normalizzato; la cultivar non viene mai dedotta dal nome del frutto di provenienza. Il diario è nella sottoraccolta privata ed è append-only. Le transazioni di salvataggio leggono e verificano la versione delle schede condivise prima di scrivere profili, esemplare, proiezione pubblica e attività storica. Nessuna migrazione automatica di dati di produzione. I codici brevi registrati (`specimenCode`, sei caratteri maiuscoli/cifre) vengono prenotati atomicamente in `specimenCodes/{code}`; la prenotazione non può essere modificata o cancellata nemmeno dopo l'eliminazione dell'esemplare. Non esiste più un'attivazione manuale: ogni nuova scheda deve avere un codice prenotato nella stessa transazione (obbligatorio nelle Rules). I record importati senza codice lo ricevono automaticamente al primo salvataggio, mantenendo versione, dati e collegamenti. La collezione legacy `specimenRegistry` non è più accessibile: non cancellare eventuali documenti di produzione senza mandato.

La cancellazione di una pianta con diario manuale è bloccata per evitare perdita di osservazioni; le voci automatiche possono essere eliminate soltanto insieme al documento padre e a `catalog/{id}` in un'unica transazione. Il salvataggio di una nuova osservazione aggiorna un timestamp privato sul documento padre, affinché il controllo concorrente impedisca cancellazioni con un inventario obsoleto. Non usare `deleteDoc` direttamente per eliminare piante con sottoraccolte.

La raccolta `plantProfiles` non è pubblicamente enumerabile: i client anonimi devono usare un filtro Firestore `public == true`, mentre l'amministratore può consultare anche i profili `public == false`. Il flag passa a `true` nella stessa transazione che pubblica il primo esemplare e resta tale come conoscenza botanica generale anche se l'esemplare torna privato; non sono mai pubblicati `privatePlants`, `seedLots` o `events`.
