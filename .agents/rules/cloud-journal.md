# M2b — Trasporto cloud del journal, non sincronizzazione completa

**CRITICAL.** Prima di modificare trasporto, Rules, ack o adapter leggere questo contratto e `docs/architecture/cloud-journal.md`.

- **MUST:** `src/cloud/journal.ts` è un writer **solo di trasporto** verso una sottocollezione privata append-only. Non è ancora una replica multi-device affidabile né un sistema di recovery da Firestore.
- **MUST:** inviare intenti validati con operationId stabile `replicaId:sequence`, `ownerUid`, protocolVersion e timestamp originale. L'operationId identifica l'intento, non un retry.
- **MUST:** la prima append avviene tramite transazione Firestore. Se il documento esiste, confrontare l'intero payload logico validato: se identico = duplicato innocuo; se differente = collisione CRITICAL, nessuna sovrascrittura.
- **MUST:** il server applica la restrizione per owner e grant `piante_access/{uid}.enabled`; il client non è un confine affidabile. Emulator prova anonimo, cross-user, revoked, spoofing e immutabilità.
- **MUST:** operazioni locali e snapshot restano sempre durevoli durante i retry. In M2b NON invocare `acknowledgeThrough`; solo una futura hydration remota causale potrà decidere la compattazione.
- **MUST:** errore di rete ambiguo = `local-pending` soltanto se la stessa operazione è ancora interamente presente nel journal locale; se non è verificabile = `failed`. Permission-denied = `rejected`, mai successo.
- **MUST:** un cambio di identità in corso interrompe il trasporto. Ogni chiamante futuro fornisce un controllo dello stesso epoch Auth prima di ogni invio.
- **MUST:** il trasporto non è collegato a UI/Auth runtime in M2b, e `firestore.m2-test.rules` è SOLO per Emulator. Non distribuire il file Rules, non scrivere al vero `pianta-db` né cambiare deploy per questa milestone.
- **MUST:** non dichiarare sincronizzazione cloud operativa, conferma visibilità pubblica o backup remoto pronto finché hydration, riconciliazione concorrente, idempotenza end-to-end, schema upgrade e account deletion non hanno test completi.
- **MUST:** non committare credenziali, utenti reali o screenshot provider nel repository pubblico; usare fixture sintetiche.

Nelle nuove milestone il protocollo di scrittura cloud, la riconciliazione dello snapshot, il controllo quota e l'account lifecycle richiederanno un contratto distinto. Non copiare versioni di Sync Protocol TheLogBook.


## M2c — scansione completa e riconciliazione non distruttiva
- **MUST:** leggere da Firestore **server** soltanto una scansione completa della sottocollezione privata, mai da una cache persistente o pagina tronca. Il limite attuale di laboratorio è 200 receipt e comporta errore esplicito al superamento.
- **MUST:** verificare schema esatto, id documento = operationId, owner, protocollo e sequenze 1..N di ogni replica. Una lacuna blocca il preview; nessun fallback a stato vuoto.
- **MUST:** validare che lo snapshot locale sia esattamente ricostruibile dalle pending; se un `acknowledgeThrough` ha compattato la storia senza una baseline duratura, bloccare e non perdere dati.
- **MUST:** non convertire `preview-only` in dati persistiti, cloud-synced o presentati nella UI. Non aggiornare le pending e non assegnare timestamp causali non dimostrati.
- **MUST:** rilevare edit concorrenti sul medesimo campo tra repliche e duplicazioni di ID; bloccare senza LWW.
- **MUST:** controllare identità/authorization epoch prima e dopo l'I/O remoto e verificare revision e contenuto IDB dopo la scansione. Il preview è di laboratorio e nessuna decisione di merge cloud reale si basa su di esso.
- **MUST:** documentare costi delle scansioni complete e integrare un protocollo di checkpoint, causalità e retention prima di attivare il servizio.


## M2d — persistenza atomica della proiezione remota
- **MUST:** la proiezione dei receipt server e i receipt stessi vanno salvati nel medesimo record IDB e nella medesima `readwrite` transaction; non introdurre un secondo storage per il cloud.
- **MUST:** verificare owner ed epoch Auth, rileggere il record IDB nella transazione, applicare CAS sull'intero envelope e ripetere il replay validante **nella transazione stessa**. Nessun commit basato su uno snapshot locale obsoleto.
- **MUST:** applicare una scansione `getDocsFromServer` completa e capped; mantenere nella base durevole tutti i vecchi receipt e rifiutare scansioni che ne perdano uno.
- **MUST:** salvare i receipt remoti senza segreti e senza publish: sono operazioni **private** che possono includere note, coordinate, prezzi e informazioni riservate.
- **MUST:** ritentare in sicurezza upload idempotenti, ma conservare pending fino a checkpoint/cloud watermark autenticati. Non invocare acknowledge automaticamente.
- **MUST:** operazioni su una pianta ripristinata devono essere validate sullo stato idratato; alla lettura successiva verificare ricostruzione esatta da receipt+pending.
- **MUST:** se emerge conflitto fra repliche, **nessun** last-write-wins: notificare condizione non risolta, conservare dati locali, richiedere protocollo causale/versioni per il futuro.
- **MUST:** una estensione v1 retrocompatibile non autorizza upgrade/downgrade distruttivi. Sconosciute versioni future continuano a bloccare l'accesso.
- **MUST:** questa milestone resta **solo laboratorio Emulator**; no live Rules, Auth/Hosting deploy, cloud in runtime UI o account registration.


## M2e — invio a blocchi con conferme verificabili
- **MUST:** il cursore upload deriva solo dai receipt server già validati e salvati nella stessa busta IDB; mai da tentativi di rete, timestamp o ack informale.
- **MUST:** evitare invii infiniti dei primi 20 pending: dopo una hydration, saltare solo le operazioni con receipt di payload identico. Un receipt omonimo divergente è errore critico.
- **MUST:** leggere e verificare il cloud *prima* dell'upload per bloccare conflitti; dopo ogni batch rileggere e verificare in memoria/IDB il payload realmente presente sul server.
- **MUST:** se una write ha successo ma la conferma dal server manca, restituire `retry-required` mantenendo tutte le pending. Se il server ha salvato la write prima del timeout, il successivo read server può recuperare senza duplicare.
- **MUST:** mantenere il limite laboratorio max 200 operazioni e max 20 per batch; non tratteggiare questo meccanismo come checkpoint scalabile su Spark.
- **MUST:** il risultato `verified-receipts-journal-retained` certifica i receipt in quel momento, non sincronizzazione causale globale, pubblicazione, né possibilità di cancellare il journal.
- **MUST:** il ciclo non è collegato a Auth UI, non gira in background e non ha accesso al Firebase live. Non distribuire Rules test-only.


## M5a — classificazione sicura dei fallimenti cloud
- **MUST:** soltanto i codici Firestore di trasporto riconosciuti come potenzialmente ambigui (`unavailable`, `deadline-exceeded`, `cancelled`, `unknown`) possono produrre `local-pending`, dopo rilettura durevole della pending identica e riconferma della sessione.
- **MUST:** collisioni append-only, errori di precondizione, quota ed eccezioni sconosciute sono `failed/cloud-error`, non timeout ritentabili. Il ciclo espone `blocked/cloud-error`; le pending non vengono rimosse e nessuna write è presentata come riconciliata senza lettura server.
- **MUST:** testare collisione reale nella transazione Firestore Emulator, timeout dopo commit remoto, guasti deterministici e IndexedDB illeggibile dopo un timeout. Nessuna modifica autorizzata a Rules live, UI o compattazione.

## M5b-1 — preflight del checkpoint senza garbage collection
- **MUST:** il candidato `candidate-only` è derivato dalla scansione completa server-backed e dal replay dello stesso account (max 200). Tutte le pending devono essere ritrovate su server con payload identico; assenze, conflitti, history gap, versioni ignote e duplicati bloccano.
- **MUST:** controllare epoch di autorizzazione e intero snapshot IndexedDB prima e dopo lettura server e SHA-256. Un backup in quarantena non può neppure avviare la scansione; errori di crypto e I/O non producono un candidato.
- **MUST:** digest e prefissi osservati non sono checkpoint persistiti né certificazioni causali/globali. Non ridurre i receipt, non aggiornare il journal, non sbloccare `acknowledgeThrough` e non alzare il limite 200 su questa base.
- **MUST:** testare assenza di conferma server, scanner Emulator, corruzione/duplicazione, auth, race, riavvio IDB e SHA. Per GC servono provider checkpoint autorevole, stable frontier/membership/fencing e recovery versionato.
## M5b-2 — registro delle osservazioni non autoritative
- **MUST:** nessun percorso cloud observation può chiamare `acknowledgeThrough`, rimuovere pending/receipts, sbloccare cloud UI o affermare convergenza causale. Le osservazioni sono attestazioni client; Firestore conferma la loro *persistenza*, NON la verità del digest o la stable frontier.
- **MUST:** `checkpointObservationSchema` impedisce `compactionAuthorized=true` e versioni ignote, verifica prefissi contigui coerenti con count massimo 200. Adapter CAS idempotente; avanzamenti con vecchi prefissi mancanti, conteggio regressivo, stesso count ma digest differente, input server invalido e readback divergente falliscono chiusi.
- **MUST:** epoch Auth/owner e snapshot IndexedDB immutati attorno a scansione, hash, scrittura, verifica server. Il commit remoto in caso di errore locale non autorizza a marcare successo.
- **MUST:** il fixture Emulator mantiene ownership/grant/tombstone e nega anonimi, cross-user, delete, schema invalido e regressione. La composizione per compatibilità conserva byte-per-byte il legacy di Pianta.

## M4a — obbligo di conservare le autorizzazioni legacy
- La baseline comunicata dal proprietario del prodotto corrisponde ai percorsi di `gernotfound/pianta/firestore.rules` (prove `USER-REPORTED` e `GITHUB-OBSERVED`, non `PROVIDER-OBSERVED`). Non usare Rules LogBook per ricostruire la baseline del progetto Firebase di Pianta.
- Ogni modifica alle Rules richiede due suite Emulator: il fixture Piante originale ed il file composito **generato soltanto nel runner** da sorgenti pinned. Non cancellare un test per far diventare verdi i controlli.
- Se le Rules live differiscono dallo snapshot, fermare il processo prima di qualunque distribuzione e rieseguire l'audit con la vera versione provider. Il file composito non deve essere aggiunto a `firebase.json`.
