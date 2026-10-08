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
