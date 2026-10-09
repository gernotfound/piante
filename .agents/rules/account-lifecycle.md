# M3c — ciclo di cancellazione account Piante (laboratorio, senza attivazione)

> Stato: specifica e runner server-only INERTE. Classificazione CRITICAL.
> Riferimento esaminato: `gernotfound/logbook/.agents/rules/account-lifecycle.md` (HEAD GitHub verificato alla data della PR). Adattare i principi, non copiare Vercel né il protocollo di cancellazione.

## Confine critico tra Piante e Pianta legacy

Il Firebase Project `pianta-db` ospita anche **Pianta**. L'identità Firebase Auth può essere condivisa da entrambi i client. Cancellare `auth.users/{uid}` comprometterebbe l'accesso alla vecchia Pianta: **il runner M3c non offre né invoca cancellazione Auth**. Non implementare una schermata "Elimina account" che faccia credere cancellata l'identità condivisa.

La sola cancellazione di dati Piante e la chiusura dell'accesso Piante sono un'operazione distinta. La scelta di prodotto su cosa significhi "elimina account" in presenza di dati legacy richiederà valutazione esplicita prima dell'apertura delle registrazioni.

## Runner e boundary

`src/account/deletionRunner.ts` contiene un contratto **esclusivamente per un backend trusted futuro**. Non ha import del client Firestore, non è un API route e non espone servizi privilegiati nella PWA. Nessun deploy o job attivo.

Invarianti:
1. Solo un backend autenticato/privilegiato può verificare ID token non revocato, recent-auth, App Check ove possibile, intenzione esplicita dell'utente e scope; l'UID deriva dal token, non dal body.
2. `begin(uid)` crea **atomicamente un tombstone server-only** `piante_account_deletions/{uid}` e prende un lease esclusivo, prima di qualsiasi rimozione dati. Il tombstone **non deve essere cancellato** in caso di errore o alla conclusione.
3. Le Rules di laboratorio negano letture/scritture per `piante_users/{uid}`, `operations` e get di `piante_access/{uid}` quando esiste il tombstone. Sono un fixture Emulator test-only e NON possono essere distribuite sul progetto condiviso senza audit Rules legacy.
4. `noExternalArtifacts` deve INVENTARIARE da provider tutte le proiezioni pubbliche, username, file Storage, indici e future risorse Piante associate all'UID. Con un risultato incerto o non vuoto il lavoro **si blocca prima del primo batch**; non trattare documenti ignoti come assenti.
5. `listPrivateCollections` usa l'API amministrativa che enumera le sottocollezioni effettive; oggi soltanto `operations` è ammessa alla rimozione. Sottocollezioni nuove/sconosciute, incluso `plants`, sono blocker finché il relativo percorso non è stato auditato, versionato e testato.
6. Ogni invocazione cancella **al massimo 50 documenti** dalla testa di una sottocollezione. Ripetere da capo nei retry: no offset/cursor come dipendenza di correttezza. Il lavoro rimane incompleto con tombstone durevole.
7. Soltanto quando nessuna sottocollezione rimane, cancellare `piante_users/{uid}`, verificarne l'assenza, cancellare il grant **solo Piante** `piante_access/{uid}`, verificarne l'assenza, quindi marcare il job `complete`.
8. `complete` non è una prova autonoma: ogni retry che lo incontra deve riverificare dati/grant assenti. Fallimenti, richieste concorrenti, timeout, nuove risorse e verifiche incoerenti non sono successi.
9. Firebase Auth, collezioni legacy `users/{uid}`, app Pianta, credenziali, Firestore Rules live e Hosting non si toccano.
10. **Non eliminare la copia IndexedDB locale** finché non arriva una prova server completa e autenticata, incluso il trattamento del backup in quarantena e degli altri dispositivi. Non è ancora stato costruito questo protocollo.

## Limitazioni per la release

Il runner NON è collegato a un backend trusted: Firebase Spark attuale non autorizza l'introduzione implicita di Cloud Functions a pagamento né Vercel. Quindi la cancellazione remota degli utenti **non è disponibile nel prodotto**. Prima di attivarla occorrono boundary trusted sostenibile, provider audit/Rules reconciliate, code deletion per tutte le collezioni/private+pubbliche+media, tombstone recovery, recent-auth, device fences, test di stress e policy retention. Il codice non equivale a un servizio operativo.

## Verifiche

Test pure Vitest: lease e concorrenza, paginazione max 50, crash/retry, timeout ambiguo, evidenze sconosciute, collezioni ignote, UID malevolo e complete senza prova. Test Firestore Emulator: barriera tombstone admin-only, anonimo, cross-user, grant ancora esistente e nessuna esposizione del job. La suite canonica di AGENTS resta obbligatoria sull'exact SHA.


## M3d — fencing tokens obbligatori per runner concorrenti
Il contratto di M3c aveva un lease dichiarato, ma le operazioni distruttive non ricevevano l'identità del lease: se la scadenza avveniva fra una query e una scrittura, un vecchio worker poteva continuare o rilasciare il lease del nuovo worker. È un rischio di concorrenza al boundary trusted, non un incidente osservato su Firebase.

In M3d `begin(uid)` torna uno stato discriminato, con un `token` opaco non prevedibile quando il lease è acquisito. Un `assertLease(uid,token)` separato rileva cambi di proprietà dopo ogni attesa asincrona, ma **non basta**: tutte le azioni distruttive devono verificare lo stesso token e la non-scadenza del lease nella **stessa transazione/operazione atomica lato provider** della mutazione. Un retry deve ottenere un nuovo token, mai riutilizzarne uno scaduto.

`release(uid,token)` è compare-and-release del proprio lease soltanto, e non cancella il tombstone. La verifica finale controlla nuovamente che non esistano asset Piante esterni prima di segnare `complete`; questa verifica non costituisce una garanzia transazionale su servizi esterni e rimane una limitazione pre-release.

Test obbligatori: scadenza durante query, scadenza fra precheck e write, cambio proprietario prima della rimozione del grant, impossibilità per il vecchio worker di liberare il nuovo lease, nuova risorsa esterna scoperta prima del `complete`. Questo modello è **inerte**: senza un adapter amministrativo reale che applichi il fencing in modo atomico non si può dichiarare disponibile la cancellazione account.
