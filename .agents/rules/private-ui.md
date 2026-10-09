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
