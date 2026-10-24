# Firestore: confine di proprietà e pubblicazione (CRITICAL)

## Documenti e autorizzazioni
- `access_grants/{uid}`: solo amministratori affidabili creano e revocano; **mai scrivibile dal browser**. Le Rules richiedono `enabled == true` per ogni lettura/scrittura privata e modifica delle vetrine.
- `profiles/{uid}`: nome utente prenotato, displayName, about e visible. Leggibile/scrivibile solo dal proprietario con grant.
- `profiles/{uid}/plants/{plantId}`: dati dell'esemplare, note, immagine, tag, flag di condivisione e timestamp.
- `profiles/{uid}/tags/{tagId}`: categorie create dall'utente, oggi immutabili dopo creazione; nessuna cancellazione/renaming automatico.
- `handles/{username}`: prenotazione globale; mappatura immutabile allo UID. La registrazione richiede operazioni collegate su handle, private profile e public garden.
- `public_gardens/{username}` e `.../plants/{plantId}`: solo proiezioni pubbliche. Le letture anonime richiedono `visible == true` nel profilo pubblico.
- `users/{uid}` e tutti gli altri namespace precedenti/ignoti: **default deny** nelle Rules candidate; non dedurre che questo sia già il comportamento live.

## Scritture atomiche
- Registrazione: una transaction crea insieme username, profilo privato e pubblico, dopo lettura collisioni. Il nome utente non è rinominabile nella v1.
- Profilo: `saveProfile()` aggiorna contemporaneamente versione privata e pubblica; una modifica unilaterale deve essere rifiutata dalle Rules.
- Pianta: `savePlant()` sincronizza la scheda privata e la proiezione pubblica (oppure elimina quest'ultima), come batch unico.
- Rimozione: `removePlant()` elimina sia privata sia pubblica nello stesso batch. La visibilità in Firestore è revocata dopo commit; file statici già distribuiti, cache esterne e screenshot **non** sono cancellati.

### Proiezione pubblica
- Il nome dell'esemplare è necessario quando `published == true`; gli altri campi si includono soltanto se il relativo flag `share*` è vero **e** il campo è valorizzato.
- I campi condivisibili sono `scientificName`, `description`, `tags`, `imageUrl`. `createdAt`, note private future, UID ed email non vengono copiati per default.
- `toPublicPlant()` nel dominio client e `matchesPublicPlant()` nelle Rules sono due implementazioni dello **stesso contratto**: un cambiamento in uno deve aggiornare l'altro e i test.
- Le Rules candidate controllano lo stato post-transazione tramite `getAfter()`/`existsAfter()` per impedire pubblicazioni da documenti inesistenti, campi non consentiti, rimozioni parziali e username prenotati senza profilo. Non convertire questo controllo in un test soltanto statico.

## Rischi e limiti
- La validazione dei campi non è una sanitizzazione di contenuto: il proprietario deve controllare la descrizione prima di selezionarla per il pubblico.
- Le Rules su Firestore autorizzano documenti, **non campi di un documento in lettura**. Per questo privato e pubblico sono separati fisicamente.
- Firestore è online-first, senza journal offline PWA. La UX non deve dichiarare riuscita una mutazione prima che il commit sia confermato.
- I nomi sono immutabili, le nuove schede usano un ID stabile, lo schema client e le Rules devono rifiutare tipi imprevisti.
- La cancellazione completa di account/identità e immagini statiche richiede un processo trusted ancora non implementato; non aprire il signup generale.
- Gli accessi alle Rules `get`/`getAfter` consumano quote di lettura e sono soggetti ai limiti per transazioni/batch: controllare quota Spark e document access count dopo ogni nuova condizione.

## Evidenza necessaria
Eseguire `tests/emulator.test.mjs` con l'Emulator **reale**; includere proprietario, anonimo, cross-user, grant assente/revocato, collisioni handle, create/update/delete atomiche, pubblicazione con flags spenti, scheda privata non pubblicata, profilo visibile/nascosto. Controllare lo SHA testato e non equiparare emulator e provider live.
