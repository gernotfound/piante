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


## M5a — distinzione fra conflitto cloud e timeout ambiguo

Un errore deterministico della transazione Firestore, come una collisione append-only (stesso operationId, payload differente), una precondizione o un errore di quota, ritorna `failed/cloud-error` e `blocked/cloud-error` nell'orchestratore. Le eccezioni applicative generiche non vengono presentate come timeout automaticamente ritentabili.

Soltanto i codici di trasporto `unavailable`, `deadline-exceeded`, `cancelled` e `unknown` (con o senza prefisso `firestore/`) consentono il risultato `local-pending`, e soltanto dopo rilettura del journal durevole con operationId/payload invariati e sessione valida. Un timeout può seguire un commit server: le conferme arrivano **solo** da una nuova scansione server, mai dal fallimento del writer. Il journal resta intatto in tutti i casi.

Test unitari e una collisione vera su Firestore Emulator confermano la classificazione. Questo perfeziona il trasporto di laboratorio, non introduce checkpoint, protocollo causale completo o scalabilità oltre 200 operazioni; le Rules live e l'interfaccia rimangono disabilitate.

## M5b-1 — candidato di checkpoint read-only

`buildCheckpointCandidate()` valida la scansione completa del journal remoto, il replay, le sequenze senza lacune per replica, la corrispondenza owner e il fatto che **ogni pending locale abbia una ricevuta server identica**. `inspectCheckpointCandidate()` verifica il medesimo owner/epoch e lo snapshot IDB prima e dopo la lettura remota **e dopo** il digest asincrono, bloccando risultati obsoleti. SHA-256 è calcolato su una serializzazione JSON a chiavi ordinate che incorpora payload remoti, stato proiettato e massimi per replica; verifica soltanto l'identità dei contenuti confrontati, non autentica il provider.

L'API restituisce esclusivamente `candidate-only`, `compactionAuthorized:false`, conteggio ricevute, SHA-256 e `observedPrefixes`. Questi prefissi sono sequenze contigue osservate su server, **non** vector clock cross-replica, stable frontier o prove di ack da dispositivi inattivi. Non esistono checkpoint persistiti, membership/retirement/fencing di replica, snapshot cloud atomici né prova che le altre repliche abbiano visto una certa modifica.

**Nessun dato viene scritto, confermato, compattato o pubblicato.** Il limite delle 200 operazioni permane e `acknowledgeThrough()` resta vietato. Questo è il primo incremento verificabile di M5b, non il completamento del protocollo causale. Il prossimo incremento dovrà progettare un provider checkpoint e un formato/versionamento causale con recovery, migrazioni, compatibilità col legacy e costo Spark prima di qualunque raccolta della cronologia o rilascio. La suite include unit test su race, history-gap, crypto, quarantena e test con Firestore Emulator.
## M5b-2 — registro remoto delle osservazioni (solo Emulator)

Dopo il candidato M5b-1, un client autorizzato può scrivere l'attestazione `piante_users/{uid}/checkpoint_observations/{replicaId}` usando una transazione Firestore che legge il precedente documento e verifica monotonia dei prefissi osservati. Un secondo passaggio `getDocFromServer` confronta l'intero record; il retry identico è idempotente, le collisioni e regressioni bloccano. L'orchestratore ripete verifiche Auth e IndexedDB dopo la scrittura, senza mutare mai il journal locale.

Il record è rigorosamente tipizzato (`protocol=1`, `status=observation-only`, `compactionAuthorized=false`, `ownerUid`, `replicaId`, `receiptCount`, `observedPrefixes`, `sha256`). In Firestore le Rules Emulator limitano owner+grant+tombstone e numero massimo, ma **non possono verificare che una dichiarazione client provenga davvero da scansione completa**. Neppure un documento durabilmente persistito equivale a una stable frontier o a un checkpoint server-autorevole. Un altro dispositivo può essere offline o possedere cronologia causale non osservata.

L'operazione è solo un passo di laboratorio. **Nessuna GC, delete, acknowledgement, nuova registrazione, sincronizzazione UI o deploy**. Rimangono il limite 200, la necessità di metadata causali/versionamento, membership e fencing generazionale delle repliche, una strategia di recovery con snapshot server-autorevole e audit delle Rules live legacy. La composizione delle Rules aggiorna solo il fixture Emulator e il relativo SHA pinned.

## M2c — anteprima di convergenza (NON hydration)
Lettura read-only del journal privato remoto, forzata al server con `getDocsFromServer`. Il reader esegue **una singola query** limitata a `max+1`: se il risultato supera il tetto (massimo 200 operazioni in laboratorio) rifiuta il risultato; **non** assume che la prima pagina rappresenti tutto il cloud.

`inspectRemoteJournal()` legge IndexedDB prima e dopo la scansione e invalida ogni risultato se cambia sessione, owner, revision o contenuto. `buildReconciliationPreview()` valida schemi, ID, owner, sequenze per replica, replica locale completa e duplicati; ricostruisce un output puramente in memoria. La lista remote + pending locali viene deduplicata per `operationId`.

L'ordinamento è deterministico sulle teste delle sequence di ogni replica e non usa il tempo muro come prova causale. Le creazioni referenziate da operazioni dipendenti possono essere riordinate conservando le sequence della singola replica. Le scritture concorrenti sullo stesso campo, le lacune e le cronologie non ricostruibili producono un blocco esplicito anziché sovrascrivere dati.

**Vincoli intenzionali:** non vengono persiste né idratazione né ack; non ci sono tombstone, deletions, epoch causali, gestione completamento upload o conflitti semantici attraverso aggiornamenti di schema. Il limite di 200 documenti è incompatibile con un prodotto general-purpose e impedisce l'uso runtime: prima di abilitare M2 serviranno checkpoint, paginazione coerente e limiti di lettura Spark sostenibili.

Il preview non deve essere considerato una dimostrazione di convergenza generale: rileva conflitti ovvi senza risolvere in modo silenzioso situazioni ambigue. Le Rules di laboratorio restano non distribuibili su `pianta-db`.


## M2d — ripristino durevole in laboratorio

`hydratePrivateJournal()` introduce una **scrittura locale IDB protetta**, distinta dal reader `inspectRemoteJournal()` non distruttivo.

1. Leggere un envelope IDB completo e il journal Firestore server-only capped (max 200 receipt).
2. Verificare owner, ID, sequence, compatibilità schema, invarianti, assenza di perdita receipt già salvati, dipendenze e conflitti.
3. Prima/dentro la transazione `readwrite` verificare epoch Auth e compare-and-swap con l'intero envelope iniziale; se è cambiato, annullare.
4. Ricalcolare la proiezione nel callback della transazione e scrivere `data` e `remoteReceipts` in un singolo record IDB; `pending` viene conservato integralmente.
5. Promise risolta **solo su `tx.oncomplete`**. Un errore I/O, una revoca, una sessione diversa o un conflitto rendono l'operazione fallita, non un falso successo.

L'array additivo `remoteReceipts` mantiene compatibilità di lettura con envelope M1 aventi `dataSchemaVersion=1`, che viene completato con `[]` in fase di parsing. Nessuna migrazione distruttiva. Dopo l'idratazione, `data` rappresenta il replay di `remoteReceipts + pending`, e un nuovo `commit()` può applicare operazioni a una pianta ripristinata da un secondo dispositivo. Ogni successivo sync ridetermina lo stato da storia completa, non da timestamp last-writer-wins.

**Limiti da non mascherare:**
- Questo algoritmo è volutamente conservativo. Blocca modifiche concorrenti allo stesso campo provenienti da repliche diverse, anche in alcune situazioni sequenziali lecite; non usa vector clock o risolutore semantico.
- Non implementa causalità completa, tombstone, cancellazione, checkpoint, compattazione, upload+hydrate orchestrati in background, pending acknowledgements e retention. La scansione completa di 200 receipt è soltanto per test, non una strategia sostenibile con quote Spark.
- Il metodo di riconciliazione **non è collegato all'interfaccia**, e le Security Rules `firestore.m2-test.rules` restano confinate a Emulator: distribuirle troncherebbe i path legacy.
- La cancellazione account, il controllo delle registrazioni e la riconciliazione con Rules reali rimangono blocker prima di attivare dati/utenti live.
- Il database condiviso `pianta-db` non viene modificato in M2d.

Test: Vitest con fake-indexeddb per race, recovery e rollback I/O; Firestore Emulator con due repository IDB, grant owner e revoca. Il risultato `hydrated-locally` certifica il **solo commit IDB**, non la convergenza globale o una pubblicazione cloud.


## M2e — coordinamento dei batch (laboratorio)
L'orchestratore opt-in `src/cloud/cycle.ts` coordina: hydration read-only server verificata e persistita → raccolta delle pending non ancora presenti nei receipt salvati → upload massimo 20 → nuova hydration e confronto. Il loop termina soltanto quando tutte le pending hanno un receipt server autenticato e identico nella stessa busta IDB, oppure dichiara un esito di blocco/retry.

`missingRemoteReceipts` permette di avanzare oltre i primi 20 intenti senza cancellare il journal: considera confermate solo le operazioni il cui payload completo è presente nei `remoteReceipts` persistiti da una precedente lettura server con Security Rules. Una collisione con lo stesso operationId fallisce.
- `verified-receipts-journal-retained`: receipt remoti verificati, pending **ancora conservate**.
- `retry-required`: timeout ambiguo, server non conferma la write o conferma non leggibile; *nessun* errore occultato.
- `blocked`: autorizzazione revocata o owner/permessi locali non coerenti; possono verificarsi eccezioni di schema, concorrenza, limite o corruzione.

Non esiste un job automatico, scheduler, registrazione aperta o UI sync. Le quote Spark impediscono scansioni complete frequenti su collezioni grandi: max 200 receipt in laboratorio, no checkpoint/retention. Il ciclo è un modello di validazione per test Unit + Firebase Emulator, non un protocollo produzione.
