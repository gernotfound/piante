# Servizi esterni — regola operativa Piante

Questa regola vale per **ogni iscrizione, attivazione, collegamento, cambio di piano, credenziale, dominio, autorizzazione, deploy o dismissione** di un servizio usato da Piante.

Il registro stabile è [`docs/operations/external-services-register.md`](../../docs/operations/external-services-register.md). È la documentazione del *perché* e del *come*, non un archivio di segreti né una prova dello stato live.

## Obblighi

- **MUST:** ogni servizio nuovo o modificato materialmente riceve nello stesso task una voce nel registro con fornitore, scopo, stato, ambiente, piano/costi, confine dati/privacy, configurazione rilevante, fonte dell'evidenza, data, dipendenze e dismissione/rollback.
- **MUST:** registrare anche i servizi intenzionalmente **non** attivati o proibiti, per evitare integrazioni accidentali.
- **MUST:** distinguere tre fonti: (1) codice/repository, (2) screenshot o dichiarazioni dell'utente, (3) verifica direttamente osservata nel provider. Una schermata inviata dall'utente non costituisce verifica API live.
- **MUST:** datare evidenze e decisioni, elencare esplicitamente gli elementi non verificati e aggiornare l'event log a ogni riconfigurazione. Gli elementi del registro non sono per definizione lo stato attuale.
- **MUST:** prima di modificare Firebase `pianta-db`, verificare le risorse effettivamente presenti e predisporre rollback. Il nuovo prodotto non implementa supporto Pianta; il provider contiene comunque dati del vecchio client secondo le schermate utente.
- **MUST:** non abilitare costi/Blaze senza consenso. Firebase Spark, GitHub pubblico e Hosting statico sono i vincoli di riferimento.
- **MUST:** tenere separati i contratti di Auth, OAuth, Firestore/Rules, Hosting, API key, IAM/App Check e deployment, anche se condividono un progetto Google Cloud.
- **MUST:** modifiche o pulizia di OAuth/Auth/API-key richiedono read-back provider, inventario dei client ancora funzionanti e rollback; non rimuovere origini o callback ancora usati tramite un refactoring locale.
- **MUST:** dopo una modifica esterna, distinguere *registrata nella console* da *funzionante nel browser/runtime*; un test del popup richiede deploy e prova reale.
- **MUST:** nessuna PR di sola documentazione distribuisce Firestore Rules, indici, Hosting o modifica Auth.

## Stati ed evidenze

Usare stati coerenti con il registro LogBook, precisando lo stato effettivo:
- `ACTIVE`: utilizzo confermato in codice/CI/runtime nel perimetro dichiarato.
- `CONFIGURED-NOT-ACTIVE`: configurazione predisposta, ma funzionalità/deploy non abilitato o non testato.
- `LEGACY`: risorsa residua di un client precedente sul provider; non implica compatibilità del nuovo prodotto.
- `OPTIONAL`: integrazione candidata, non obbligatoria.
- `NOT-INTEGRATED`: servizio non utilizzato dalla nuova Piante.
- `VERIFY-LIVE`: stato provider non letto direttamente, oppure evidenza incompleta.

Indicazione della prova: `GITHUB-OBSERVED`, `USER-SCREENSHOT`, `USER-REPORTED`, `PROVIDER-OBSERVED`, `NOT-VERIFIED`. Non usare `PROVIDER-OBSERVED` per screenshot.

## Confine del repository pubblico

**Non committare** client secret OAuth, service-account email/chiavi, token, cookie, password, indirizzi email personali, UID, numeri di progetto/account o fatturazione non indispensabili, identificativi sensibili, file `.env` reali o screenshot contenenti dati personali. Non riportare i valori visualizzati nelle console se bastano nomi delle impostazioni.

In `.env.example` documentare soltanto il contratto delle variabili; i valori reali rimangono nel sistema di build/secret storage pertinente. Una chiave Web Firebase può essere pubblica, ma non è necessario duplicarla nel registro.

## Procedura al cambio provider

1. Controllare `main`, AGENTS, la presente regola e il registro.
2. Identificare chi usa il servizio e il perimetro dati, privacy, sicurezza, quote e costi.
3. Verificare quando possibile il provider e documentare ciò che non è verificabile.
4. Eseguire la modifica tecnica autorizzata, test ed eventuale rollback.
5. Aggiornare il registro (mappa + eventi + verifiche aperte) **nella stessa PR**, oppure documentare il blocco.
6. Conservare l'evidenza nel provider o nelle conversazioni senza pubblicare screenshot sensibili nel repository.

La documentazione stabile nel repository prevale su una richiesta di «ricordare» affidata alla sola cronologia della chat; lo stato provider live prevale su qualsiasi documento storico.


## Piante greenfield — decisione 2026-10-21
- **MUST:** Piante parte con dati nuovi, senza migrazione, adattamento o test di coesistenza Pianta. Non ricreare le vecchie fixture Rules e i converter backup.
- **MUST:** distinguere `NO-MIGRATION` (scelta prodotto), `CLEANUP-PENDING` (risorse provider osservate ma non cancellate) e `RETIRED` (verificato su provider). L'utente non vuole esportare dati dal vecchio client; ciò non attesta un database Firestore vuoto.
- **MUST:** conservare come fatto storico l'evidenza `USER-SCREENSHOT`: Firestore `(default)` `europe-west12` con `users`, `plants` e `images`; Rules copiate dall'utente, Auth Email/Password e Google, un solo account test dichiarato `USER-REPORTED`. Nessuna di queste osservazioni costituisce verifica API provider.
- **MUST:** non eliminare dati/UID, Rules, app OAuth o sito Vercel nel task di pulizia del codice. La dismissione esterna può seguire con inventario, valutazione delle dipendenze e consenso esplicito per la rimozione irreversibile.

