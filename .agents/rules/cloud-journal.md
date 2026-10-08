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
