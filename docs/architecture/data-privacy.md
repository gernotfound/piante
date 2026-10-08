# Confine tra dati privati e pubblici

**Stato: specifica di architettura, non implementata.**

## Contratto
- La scheda privata non deve essere mai leggibile anonimamente o da altri UID.
- La pubblicazione è una proiezione separata composta da una allowlist chiusa e versionata.
- La validazione deve essere applicata sia nel codice applicativo sia nelle Firestore Security Rules.
- Proprietario e username si legano mediante una prenotazione atomica verificabile; gli username non dipendono dal Firebase UID nell'URL.
- Gli slug sono stabili e univoci entro il profilo; rinomine e alias vanno gestiti esplicitamente.
- Nessuna pubblicazione automatica dei campi introdotti in futuro.
- I file media pubblici non fanno riferimento a documenti privati; devono essere esportati in forma ottimizzata senza EXIF e GPS.
- Eliminazione/non pubblicazione deve negare subito la lettura pubblica anche quando la bonifica differita dei media non è completa.
- Le cache esterne e screenshot già acquisiti non possono essere revocati retroattivamente.

## Materiale inizialmente escluso
Prezzi, venditori, note personali, foto di diario non selezionate, coordinate puntuali, email, identità Firebase, dettagli privati della proprietà.

## Regole per i test futuri
- Anonimo: deny su tutti i documenti privati, allow solo sui documenti pubblicati.
- Altri account: deny lettura/scrittura private e ogni modifica ai profili altrui.
- Proprietario: scrittura consentita soltanto entro ownership e schema validi.
- Slug/username: nessuna collisione, appropriazione o sovrascrittura cross-user.
- Offlining: la UI non presenta una pubblicazione queued come già visibile al pubblico.
- Ritiro: nessun endpoint pubblico può leggere la scheda ritirata.
- Immagini: impossibile inferire/accessor documenti privati dagli ID pubblici.
- Evitare letture illimitate e abusi delle quote Spark.

## Punto aperto: backend trusted
La completa cancellazione cross-collection/account e alcune garanzie sulla pubblicazione necessitano di un'architettura trusted se non garantibili tramite Rules e client. Non aprire la registrazione pubblica finché questa decisione non è risolta e testata.
