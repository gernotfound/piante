# M3a — interfaccia privata sperimentale

**SENSITIVE** per UI, **CRITICAL** per accesso, dati e persistenza. Valgono AGENTS e le regole di storage/cloud.

- Accesso a `PrivateGarden` soltanto dentro la condizione `authorized` di `AuthSessionController`; il parent `AuthTestPanel` esiste solo con `VITE_AUTH_TEST_MODE=true`. Nulla viene visualizzato per UID negati, sessione persa o stato checking.
- `ownerScope` deriva dal grant (non dall'input dell'utente) e deve essere usato per tutte le operazioni IndexedDB; `key={uid}` isola lo stato React a ogni cambio account.
- Salvare prima, aggiornare UI dopo commit; un errore IDB, una mancanza di crypto ID o una validazione Zod non è successo. Non usare copie parallele in localStorage o cache Firestore persistente.
- Nessuna connessione CloudJournal, auth provisioning, pubblicazione o Rules live da M3a.
- La scheda, il diario e i luoghi sono private-only; non duplicare dati in HTML pubblico, SEO, analytics o account non autorizzati.
- Mostrare un avviso reale sui dati **solo locali, senza backup**. Non nascondere l'avviso nelle modalità scure o mobili.
- Test: isolamento tra due `user:uid` nel medesimo IDB, failure path salvataggio, reload, form di dominio, nessun salvataggio nel default deploy e accessibilità mobile.

## M8a — editor dettagli dell'esemplare (CRITICAL per dati)
- **MUST:** l'editor è solo per l'owner già autorizzato, test-only, senza dati cloud o pubblicazione. Leggere dati solo dallo snapshot IndexedDB e salvare modifiche tramite `LocalGardenRepository.commit` tipizzato.
- **MUST:** per l'editing usare `expectedRevision` acquisita all'apertura del form e verificata nella transazione IDB; un'altra modifica nello stesso owner durante l'editing impone il blocco e la rilettura. Non rimpiazzare il journal con lo snapshot del form. `null` elimina solo optional; campo omesso non deve essere resettato.
- **MUST:** non creare un'operazione per salvataggi no-op; successo solo dopo `oncomplete`. Ripristino backup e revoca Auth mantengono i guard correnti. Test su reload, alterazioni concorrenti, invalidità e rinomina/luogo/vaso/note.

## M8d — lettura storica e filtri del diario
- **MUST:** lo storico è privato e test-only, alimentato unicamente dallo snapshot `LocalGardenRepository` già autorizzato. Mostrare l'intera cronologia solo per pagine da 10 eventi; non limitarsi agli ultimi 8 né produrre query/scritture cloud.
- **MUST:** filtro per `plantId` e tipo evento, mai basato su stringhe di nomi non univoci. Filtri combinati con AND e reset della pagina; pagina corrente clamped se cambia il numero di risultati. Data discendente, poi timestamp e ID per ordine stabile.
- **MUST:** mantenere note e misurazioni visibili solo nell'area privata; filtri UI senza persistenza, senza journal extra e senza cross-user leak. Elementi di navigazione accessibili e interazioni mobili, incluso feedback di elenco vuoto.
- **TEST:** storico >20 eventi, filtro per pianta/tipo, pagina precedente/successiva, zero risultati, date pari, reload e snapshot/pending byte-equivalenti.

## M8c — diario numerico tipizzato (CRITICAL per dati)
- **MUST:** mostrare misura altezza (cm) e pH solo nell'attività misurazione, peso raccolto (g) solo in raccolta. L'attività `care` e tutte le altre non devono incorporare valori metrici nascosti.
- **MUST:** lo schema resta il contratto autorevole; la UI applica range finite anche prima del commit, non converte campo vuoto in `0`, e mantiene compatibilità dei vecchi eventi senza misure. Mai introdurre timestamp o formati cloud nuovi per questi dati.
- **MUST:** `event.add` salva solo dopo CAS sulla revisione IndexedDB catturata in UI; cancellazioni di sessione, una seconda scheda o fallimento del database non vengono mostrati come successo. Dopo salvataggio cancellare i campi del form sensibili ai duplicati accidentali.
- **TEST:** misura, pH, raccolto, zero valido, range non valido, tipo cambiato, reload, stale revision e private-only.

## M8b — editor luoghi (CRITICAL per dati)
- **MUST:** luoghi mostrati e modificati esclusivamente nell'area privata già autorizzata, solo IndexedDB. Etichette e form non duplicano dati nelle viste pubbliche; le note sono riservate.
- **MUST:** i place ID e i riferimenti `plant.placeId` restano invariati. Patch soltanto dei campi mostrati (name, kind, notes), lasciando coordinate e campi futuri intatti. Le note vuote producono `null`, mai una cancellazione dell'oggetto luogo.
- **MUST:** la revisione letta all'apertura è verificata nella stessa transazione IDB dell'append; tutte le race, gli abort IDB e le revoche falliscono senza successo UI. No-op non crea journal. Regressioni su reload, referenze, cancellazione note, concorrenza e fallimenti.

## M3b — controlli di backup locale
- Montare BackupPanel solo dentro PrivateGarden di owner test autorizzato; import/export devono ricontrollare la stessa sessione durante I/O asincrono e prima del commit IDB.
- Download manuale JSON in chiaro, avviso di rischio privacy; eventuali errori di generazione/browser non vanno mascherati da successo.
- L'import mostra soltanto l'anteprima iniziale, quindi richiede una seconda azione. Non recuperare automaticamente dati da file o sovrascrivere un account già utilizzato.
- Mostrare chiaramente lo stato `backupQuarantined` e l'assenza di sincronizzazione cloud reale.


## M3f — verificabilità continua dell'autorizzazione
- **MUST:** nessun accesso alla UI privata dopo una sola lettura del grant, un ID token cache, una risposta Firestore `fromCache`, un errore listener, una revoca grant/tombstone o un segnale `offline`.
- **MUST:** ascoltare token/identità e grant server in stream attivo con metadata; revocare il precedente owner immediatamente su UID/token change, logout, offline e listener terminal failure. Dopo resume/online richiedere un nuovo server proof prima di rimontare.
- **MUST:** ignorare callback async di subscription obsolete tramite generazioni monotone e smontare `PrivateGarden`; nessun riaccesso da un Auth callback vecchio dopo logout esplicito, se non a seguito di un nuovo `signIn`.
- **MUST:** i callback `isStillAuthorized` di repository e backup sono derivati dallo stato corrente del controller, non da un booleano catturato al momento del click.
- **TEST:** UID switch, token refresh, grant false, tombstone, cached snapshot, listener error, logout in volo, signout failure, late events, offline/online e persistenza locale intatta.
- **LIMITI:** `navigator.onLine` non garantisce che Firestore sia raggiungibile; lo streaming può non segnalare istantaneamente una disconnessione silenziosa. La Security Rule live governa le letture/scritture remote; non dichiarare isolamento crittografico IndexedDB o revoca offline perfetta.
