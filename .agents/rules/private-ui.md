# M3a — interfaccia privata sperimentale

**SENSITIVE** per UI, **CRITICAL** per accesso, dati e persistenza. Valgono AGENTS e le regole di storage/cloud.

- Accesso a `PrivateGarden` soltanto dentro la condizione `authorized` di `AuthSessionController`; il parent `AuthTestPanel` esiste solo con `VITE_AUTH_TEST_MODE=true`. Nulla viene visualizzato per UID negati, sessione persa o stato checking.
- `ownerScope` deriva dal grant (non dall'input dell'utente) e deve essere usato per tutte le operazioni IndexedDB; `key={uid}` isola lo stato React a ogni cambio account.
- Salvare prima, aggiornare UI dopo commit; un errore IDB, una mancanza di crypto ID o una validazione Zod non è successo. Non usare copie parallele in localStorage o cache Firestore persistente.
- Nessuna connessione CloudJournal, auth provisioning, pubblicazione o Rules live da M3a.
- La scheda, il diario e i luoghi sono private-only; non duplicare dati in HTML pubblico, SEO, analytics o account non autorizzati.
- Mostrare un avviso reale sui dati **solo locali, senza backup**. Non nascondere l'avviso nelle modalità scure o mobili.
- Test: isolamento tra due `user:uid` nel medesimo IDB, failure path salvataggio, reload, form di dominio, nessun salvataggio nel default deploy e accessibilità mobile.

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
