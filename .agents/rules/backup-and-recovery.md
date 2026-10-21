# M3b — backup completo e ripristino in quarantena

> Classificazione **CRITICAL**: l'archivio JSON esportato contiene dati privati, coordinate, prezzi, note, ricevute cloud e journal.

## Distinzione backup Pianta / Piante nel cutover
- Il product owner ha deciso di dismettere Pianta (2026-10-21), **non** di cancellare immediatamente gli archivi. Prima della dismissione: backup privato verificato di `users/{uid}`, sottocollezioni, immagini, logs e indici/Rules rilevanti; non affidarsi alla sola copia JSON della UI.
- Il vecchio client `gernotfound/pianta/src/lib/backup.ts` emette JSON con `schemaVersion:3` e `app:'Pianta'`, **incompatibile** con il backup locale `piante-private-backup/v1`. Non usare `restoreLocalBackup` né `restoreEmptyFromBackup` per importarlo.
- Verificare i filtri legacy che potrebbero scartare documenti anomali, le preferenze locali, il diario annidato e i client offline. Confrontare manifest/conteggi con inventario Firestore completo e prove di restore. Non salvare file contenenti dati privati nel repository pubblico o in PR/issue.
- Fino a migrazione, conferma di recuperabilità, cutover e rollback: non distruggere dati o identità legacy; nessuna modifica live in una PR solo documentale.

## Export
- Fare una lettura durevole da IndexedDB e validare l'intero envelope M1/M2 prima di esportare; non limitarsi allo snapshot visibile della UI.
- Esportare `data`, `pending`, `remoteReceipts`, `ownerScope`, `replicaId`, revisioni e versioni, senza tralasciare operazioni pendenti; formato `piante-private-backup/v1`.
- Ricalcolare il replay locale/cloud, non considerare sufficienti i soli schemi Zod.
- SHA-256 rileva corruzione accidentale ma **NON autentica** l'origine del file: non presentarlo come una firma crittografica.
- Il file è JSON in chiaro, **non cifrato**. Non inviarlo a provider, server, analytics o repository, non renderlo pubblico; l'utente deve conservarlo protetto.

## Ripristino
- Per importare eseguire prima un'anteprima read-only con schema versionato e rigoroso, limite 32 MiB, checksum e replay, conferma esplicita utente.
- Importare solo se l'owner del file coincide con l'account autenticato e se il relativo record locale è **completamente vuoto**; niente merge/overwrite impliciti, né reset del locale a fronte di parse error.
- Controllare autorizzazione prima e dentro la transazione IndexedDB; commit atomico di snapshot, pending e ricevute. Una quota esaurita o IDB abort non deve produrre successo.
- Dopo un import mantenere lo stesso `replicaId` originale per preservare gli operation ID ma salvare `backupQuarantined=true` in modo durevole. **Bloccare qualsiasi cloud upload/hydration**: lo stesso backup potrebbe essere importato su un secondo device e causare collisioni remote.
- Il ripristino continua a consentire modifiche **solo locali** e conserva journal e dati integrali. Solo una futura migrazione causale esplicita potrà togliere la quarantena.
- Non usare questo percorso per importare JSON della vecchia app Pianta; formato e migrazione legacy richiedono contratti dedicati e backup autorizzati.
- Nessun deploy Rules/Hosting o cambio Firebase live deriva da M3b.

## Regressioni obbligatorie
Round-trip di dati privati, pending e remote receipt; logout in volo; UID diverso; archivio non vuoto; versione futura e dati corrotti; checksum errato; replay inconsistente; IndexedDB rollback; impedimento delle scritture cloud dopo import. Verificare UX del download e che la UI non annunci un backup automaticamente salvato senza conferma del browser.
