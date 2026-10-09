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


## M3c — distinzione tra dati Piante e account condiviso
- Il Progetto Firebase `pianta-db` ospita l'identità Auth e le collection della vecchia Pianta. La cancellazione del solo spazio Piante è distinta dalla rimozione dell'account Auth condiviso.
- Un job privato `piante_account_deletions/{uid}`, creato **solo da un backend amministrativo futuro**, funge da barriera: nella suite Rules Emulator impedisce l'accesso client al namespace `piante_users/{uid}` e al grant Piante.
- Non pubblicare operazioni cancellabili attraverso SDK client; non toccare `users/{uid}` legacy, né Firebase Auth. Lo stato complete deve avere prova di assenza cloud, compresi grant e dipendenze pubbliche/media.
- Il runner di laboratorio `src/account/deletionRunner.ts` è intenzionalmente inerte e NON costituisce una procedura di diritto alla cancellazione operativa. La UI non offre per ora la cancellazione account.
- Vedi `.agents/rules/account-lifecycle.md` per sequenza, crash consistency, limiti e blocker esterni.


## M3d — perdita del lease e scritture amministrative
La cancellazione privata Piante di laboratorio ora richiede token di fencing emessi dal backend e verificati ad ogni mutazione amministrativa. Un worker scaduto non può proseguire, cancellare grant o liberare il lock di un worker più recente. Il token non è una credenziale per l'utente: nessun codice di cancellazione deve essere esportato alla UI o all'SDK Firebase client. Le implementazioni concrete devono attestare fencing atomico e inventario completo prima di poter eliminare dati reali.
