# M2b — Trasporto journal su Firestore (laboratorio)

> Stato: **implementazione e test Emulator soltanto**, nessun accesso cloud reale, nessun deploy Rules/Hosting, nessun collegamento UI. Le collezioni legacy di `pianta-db` restano intatte.

## Problema affrontato

Un salvataggio locale può andare a buon fine, mentre la conferma di rete si perde dopo un commit remoto. Ritentare con un nuovo ID causerebbe duplicati; eliminare subito l'operazione locale impedirebbe recovery e merge. Inoltre un cambio di sessione può lasciare in volo risposte della precedente identità.

## Contratto M2b

| Componente | Compito |
| --- | --- |
| `src/cloud/journal.ts` | Valida l'owner e costruisce il record; carica un prefisso bounded (massimo 20) e classifica l'esito |
| `src/cloud/firestoreJournal.ts` | Transazione Firestore append-only; ripetizione identica letta come duplicate, divergenza come collisione |
| `firestore.m2-test.rules` | Autorizzazione owner+grant, campo `protocol:1`, allowlist del payload, creazione unica, update/delete vietati |
| `tests/rules/cloudJournal.test.ts` | Test reale sulla Rules Emulator con Firestore SDK; non un mock |
| `src/cloud/journal.test.ts` | Failure path, retry, timeout, prova journal durevole e session epoch |

Documento laboratorio proposto: `piante_users/{uid}/operations/{replicaId}:{sequence}`, con campi:
`protocol`, `ownerUid`, `operationId`, `replicaId`, `sequence`, `appliedAt`, `operation`.

I receipt sono privati e non pubblicabili. `protocol=1` è un identificatore proprio di Piante per il formato del trasporto: **non** corrisponde ai protocolli TheLogBook.

## Esiti

- `uploaded-awaiting-reconciliation`: scrittura server confermata, ma le operazioni locali restano pendenti finché non esiste un merge/hydration sicuro.
- `local-pending`: errore trasporto ambiguo e intenzione rimasta durevole identica localmente; retry consentito.
- `rejected`: permesso negato, non equivale a sync.
- `failed`: perdita della prova durevole, owner cambiato o errore di invarianti. Serve intervento/diagnosi.
- `nothing-to-upload`: nessuna pending.

Questi sono stati di **trasporto**, non stati business di sincronizzazione completata.

## Mancanze deliberatamente fuori perimetro

- Nessuna hydration cloud o merge tra dispositivi.
- Nessun `acknowledgeThrough()` automatico, né compattazione del journal.
- Nessuna gestione delle repliche dismesse, tombstone, ordinamento causale dei cambi interdipendenti.
- Nessuna scrittura documenti business finali, nessuna UI CRUD e nessun sistema multiutente aperto.
- Nessuna sostituzione delle Rules live della vecchia Pianta.
- Nessun procedimento di eliminazione account/cleanup cross-collection ancora disponibile.
- Limiti quota, retention e gestione media saranno progettati prima di abilitare le scritture vere.

Per rendere operativo il cloud serviranno validazione completa delle Rules reali, algoritmo di riconciliazione idempotente e test end-to-end su Emulator, oltre al piano di cancellazione account. Non dichiarare il cloud «sincronizzato» perché esistono operation receipts.
