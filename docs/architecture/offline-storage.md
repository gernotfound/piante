# Contratto M1 — Persistenza offline e recovery

> Classificazione: CRITICAL. Implementato soltanto per uso locale, non collegato all'interfaccia né a Firebase.

## Schema e confini
- `LOCAL_ENVELOPE_VERSION=1`, `LOCAL_DATA_SCHEMA_VERSION=1`, indipendenti da TheLogBook.
- IndexedDB `piante-local-m1`, object store `envelopes`. Chiavi owner-scope `user:<uid>` e `guest:<id>`.
- Un solo record JSON-clonabile per owner contiene `data` (plants, places, events), `replicaId`, `revision`, `lastSequence` e `pending[]`.
- Non si accede a dati Auth, Firestore, Vercel, collezioni legacy o pubblicazioni da questo modulo.
- Le IDB key sono isolamento logico, **non una barriera crittografica o un sostituto dell'autorizzazione**. Prima di collegare questo codice a un utente autenticato servono bootstrap/logout, cleanup e controllo ownership provati in M2.

## Operazioni
- Un'intenzione viene validata con Zod e applicata dal reducer puro. Anche lo stato risultante è validato.
- Patch: proprietà omessa = invariata; proprietà `null` = rimozione di campo opzionale; `undefined` è errore.
- Eventi e luoghi hanno ID stabili; ID duplicati, eventi orfani, luoghi/genitori mancanti e genealogie cicliche falliscono.
- `commit()` apre una transazione IndexedDB `readwrite`, legge e valida l'envelope, calcola stato e journal, quindi salva l'**intero envelope** come un'unica write; la promise si risolve solo su `tx.oncomplete`.
- Le transazioni tra schede sullo stesso object store sono serializzate da IndexedDB: non usare un read-modify-write diviso in due transazioni.
- Il journal conserva intento, timestamp applicativo, sequence monotona e ID `replicaId:sequence` per replay deterministico. Non tagliare mai la coda per recuperare spazio: superato il limite deve segnalare errore.
- `acknowledgeThrough(seq)` elimina solo un prefisso delle operazioni, preservando business state e nuove modifiche. **M1 non chiama mai l'ack automaticamente**: M2 dovrà documentare la prova remota richiesta.

## Recovery e dati incompatibili
- Un envelope realmente assente è uno stato iniziale vuoto. Un envelope esistente ma incompatibile, corrotto, di schema futuro o con owner mismatch è un errore: non azzerarlo, non reimportarlo e non riscriverlo.
- Un errore durante la transazione non può lasciare data e journal disallineati.
- Il riavvio rilegge i dati durevoli e preserva tutte le pending operations.
- `replayOperations()` ricostruisce deterministicamente lo stato dalla baseline e dalle operazioni pending, usando i timestamp già registrati.
- Una futura sincronizzazione dovrà verificare lost acknowledgement, retry remoto idempotente, conflitti tra dispositivi, sync epoch/logout e ripresa dopo aggiornamenti SW. **Queste funzionalità non sono implementate in M1**.

## Test eseguiti dal gate
Vitest verifica validazione date, schema e riferimenti, cicli genealogici, replay, ID duplicati, concorrenza tra istanze IDB, errore indotto durante `put`, preservazione del journal, ack selettivo, isolamenti per owner, database indisponibile e versioni incompatibili.

Niente Firebase Emulator in M1: non ci sono Rules applicative nuove o query cloud da testare. Sarà obbligatorio nel momento in cui il sync/Firestore entrerà nel perimetro.

## Interfaccia con M2b
Il trasporto opzionale di laboratorio può serializzare le pending su Firestore, ma **non** rimuove il journal locale quando la scrittura è confermata. Non esiste ancora una baseline cloud autoritativa per ricostruire dati e modifiche concorrenti. Consultare [`cloud-journal.md`](cloud-journal.md).


## M2d — stato remoto nello stesso envelope
Il campo additivo facoltativo `remoteReceipts` (default `[]`) è persistito assieme allo stato `data`, al `pending` e alla `revision` nel **medesimo record IDB**. È compatibile con envelope M1 v1 precedentemente salvati (non vengono resettati). Dopo hydration valida, `data` è la proiezione delle operazioni remote verificate e delle pending, mentre `pending` resta intatto.
La hydration ricontrolla il CAS dentro la transazione `readwrite`, rifiuta storia server perduta, owner diverso, edit concorrenti o corruzione dei receipt; errori storage annullano l'intero commit. Vedi [`cloud-journal.md`](cloud-journal.md). Nessuna Rules o Firebase live attivata.

### Inizializzazione identità replica (regressione M2d)
Una prima `read()` senza envelope ora crea e conferma **atomicamente** l'envelope iniziale in una transazione IDB `readwrite`, prima di restituire l'ID replica. Prima di questa regressione, una lettura a DB vuoto generava un `replicaId` effimero diverso ad ogni chiamata: questo rendeva impossibile il CAS di hydration e rischiava IDs incoerenti. Testare reload e letture concorrenti al primo accesso.

## M3b — esportazione e ripristino versionati, in quarantena
- `src/backup/localBackup.ts` esporta l'**intero** envelope owner-scoped, comprensivo di piante, luoghi, eventi, journal pendente e ricevute Firestore già presenti. Contratto esterno indipendente: `kind=piante-private-backup`, `formatVersion=1`, `exportedAt` ISO, `envelope`, `sha256`.
- Il checksum SHA-256 confronta il payload canonicalizzato dopo schema parse per identificare danni accidentali; **non** prova chi abbia prodotto il file. JSON non cifrato, nessun trasferimento online, massimo 32 MiB.
- Validazione d'import: stesso ownerScope autenticato, versione stretta, checksum, replay completo. L'anteprima non muta lo storage.
- Recovery atomico consentito solo su archive **vuoto**, con check della sessione dentro `readwrite`; ogni fallimento annulla l'intero record, senza perdita di dati preesistenti.
- La copia conserva il `replicaId` e gli operationId originali per non alterare la prova del journal, ma marca `backupQuarantined=true` e blocca uploads/hydration cloud anche se il file proviene da un dispositivo precedentemente sincronizzato. Questa quarantena non ha sblocco automatico.
- Il sistema non esegue merge import, import Pianta legacy né sync dopo restore. Per ripristino multi-device futuro occorrono rekey sicuro, protocolli causali, checkpoint e accounting dei receipt.
