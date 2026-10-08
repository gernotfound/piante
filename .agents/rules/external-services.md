# Servizi esterni — regola operativa Piante

Questa regola vale per **ogni iscrizione, attivazione, collegamento, cambio di piano, credenziale, dominio, autorizzazione, deploy o dismissione** di un servizio usato da Piante.

Il registro stabile è [`docs/operations/external-services-register.md`](../../docs/operations/external-services-register.md). È la documentazione del *perché* e del *come*, non un archivio di segreti né una prova dello stato live.

## Obblighi

- **MUST:** ogni servizio nuovo o modificato materialmente riceve nello stesso task una voce nel registro con fornitore, scopo, stato, ambiente, piano/costi, confine dati/privacy, configurazione rilevante, fonte dell'evidenza, data, dipendenze e dismissione/rollback.
- **MUST:** registrare anche i servizi intenzionalmente **non** attivati o proibiti, per evitare integrazioni accidentali.
- **MUST:** distinguere tre fonti: (1) codice/repository, (2) screenshot o dichiarazioni dell'utente, (3) verifica direttamente osservata nel provider. Una schermata inviata dall'utente non costituisce verifica API live.
- **MUST:** datare evidenze e decisioni, elencare esplicitamente gli elementi non verificati e aggiornare l'event log a ogni riconfigurazione. Gli elementi del registro non sono per definizione lo stato attuale.
- **MUST:** prima di modificare un provider condiviso, verificare il relativo impatto sulle app legacy e predisporre rollback. Il progetto Firebase `pianta-db` è condiviso con **Pianta**.
- **MUST:** non abilitare costi/Blaze senza consenso. Firebase Spark, GitHub pubblico e Hosting statico sono i vincoli di riferimento.
- **MUST:** tenere separati i contratti di Auth, OAuth, Firestore/Rules, Hosting, API key, IAM/App Check e deployment, anche se condividono un progetto Google Cloud.
- **MUST:** per modifiche alle allowlist OAuth/Auth/API-key **aggiungere senza rimuovere** origin e callback legacy finché non è stato dimostrato che nessun client ne dipende. La pulizia richiede audit dedicato.
- **MUST:** dopo una modifica esterna, distinguere *registrata nella console* da *funzionante nel browser/runtime*; un test del popup richiede deploy e prova reale.
- **MUST:** nessuna PR di sola documentazione distribuisce Firestore Rules, indici, Hosting o modifica Auth.

## Stati ed evidenze

Usare stati coerenti con il registro LogBook, precisando lo stato effettivo:
- `ACTIVE`: utilizzo confermato in codice/CI/runtime nel perimetro dichiarato.
- `CONFIGURED-NOT-ACTIVE`: configurazione predisposta, ma funzionalità/deploy non abilitato o non testato.
- `LEGACY`: dipendenza di Pianta o di un client precedente, da preservare.
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
