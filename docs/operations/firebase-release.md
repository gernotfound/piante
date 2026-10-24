# Primo rilascio controllato di Piante su Firebase

**Stato — 24 ottobre 2026:** nuovo codice su GitHub, nessuna distribuzione o variazione di provider effettuata in questa fase. I riferimenti `pianta-db`, site ID `piante`, `piante.web.app` sono noti dal repository/storico ma l'inventario privilegiato del provider non è stato ancora verificato. Un ambiente di strumenti non ha potuto interrogare direttamente il dominio: non è prova di sito offline.

## 1. Inventario di sola lettura

Aprire [Firebase Console — pianta-db](https://console.firebase.google.com/project/pianta-db/overview). Verificare la Web App, l'ID progetto e il Site Hosting `piante`, la cronologia delle release e gli identificativi; non copiare UID, token, dati dei profili o credenziali amministrative in GitHub. Controllare che il piano sia **Spark**, senza billing introdotto. Controllare OAuth Google, domini autorizzati inclusa `piante.web.app`, e l'eventuale provider Email/Password di vecchie applicazioni prima di disabilitarlo. Leggere le Rules Firestore **effettivamente pubblicate** e verificare eventuali client ancora dipendenti dal namespace `users`. Non eliminare dati precedenti per deduzione.

## 2. Preflight pubblico dalla GitHub Actions

Workflow manuale [Check live Firebase Hosting (read only)](https://github.com/gernotfound/piante/actions/workflows/hosting-readiness.yml): selezionare `main`, poi **Run workflow**. È un controllo di sola lettura di `https://piante.web.app`, `/__/firebase/init.json` e del modulo applicativo. Controlla `projectId=pianta-db` senza scrivere nei log API key/App ID. Se la pagina corrente è ancora la vecchia, il FAIL è **normale** prima del deploy. Un PASS **non** verifica le Rules o il login Google live.

In sviluppo è disponibile anche `npm run check:hosting` da Node 22+; non richiede token amministrativi e termina con errore se l'ambiente non riesce a interrogare il dominio.

## 3. Release gates

- CI verde per lo SHA candidato: test statici, Firestore Emulator e browser Chromium/WebKit.
- Esistenza e autorizzazioni Firebase Web/Hosting verificate; `/__/firebase/init.json` associato a `pianta-db` e OAuth Handler su `piante.web.app` verificato con browser.
- Inventario dei documenti correnti, backup o rollback delle Rules live, valutazione vecchio namespace `users` e approvazione **separata** del cambiamento di Rules.
- Solo UID autorizzati: grant amministrativo `access_grants/{uid}` con `enabled: true` in Console, mai nel repository né creato dal browser; accesso Google da solo non conferisce permessi.
- Preparare il rollback Hosting alla release precedente e un rollback Rules compatibile con i client ancora in uso. Il rollback frontend non cancella dati.
- Non aprire iscrizioni al pubblico finché non è implementata la cancellazione account attendibile. Non attivare Storage o Blaze.

## 4. Distribuzione deliberata

Solo su macchina/account già autorizzati e **dopo** le verifiche, distribuire **Hosting da solo** usando `firebase deploy --only hosting:piante --project pianta-db` dalla root. `firebase.json` punta a `web` e contiene soltanto Hosting: non distribuire le Rules insieme a Hosting, né aggiungere un trigger GitHub automatico senza identità/protezione del deployer.

Le Security Rules candidate `firestore.rules` non sono ancora live. Il loro deployment eventuale richiede verifica e approvazione specifici, non è coperto da un semplice merge GitHub.

## 5. Smoke test dopo la distribuzione

Su smartphone e PC: login Google, autorizzazione test account, creazione username, scheda privata, assegnazione tag, selezione dei soli campi pubblicabili, vetrina anonima, ricerca/tag, ritiro visibilità e logout. In un secondo browser non autenticato verificare che la vetrina nascosta non sia consultabile. Il browser non può proteggere immagini servite staticamente da `web/images`, anche se la scheda viene nascosta.

Rieseguire il workflow pubblico e registrare in `docs/firebase-configurazione.md` la data di verifica, l'evidenza osservata e gli eventuali limiti, senza riportare segreti o dati personali. 

## 6. Foto dall'account — verifica prima del rilascio

Il nuovo modulo upload WebP usa i **documenti Firestore**, non Firebase Storage. Nel pannello prova con una foto JPEG/PNG e verifica:
- Compressione massima 120KiB, nessuna esposizione dell'originale (o di EXIF), uso di `Bytes`.
- Scheda privata con foto non leggibile da un altro account né in navigazione anonima.
- Solo il proprietario può selezionare pubblicazione e visibilità foto; il pubblico non riceve `bytes` nella scheda di testo ma carica separatamente il documento media quando l'immagine entra nel viewport.
- Revoca del flag foto e del flag vetrina con test anonimo in un altro browser; sostituzione e cancellazione della scheda eliminano la media, senza residui in Firestore.
- Monitoraggio quote Firestore Spark. Con ~120KiB per foto, molte visite alla galleria consumano traffico; questa soluzione è per piccole collezioni, non un servizio fotografico commerciale.

L'Emulator testa le **Rules candidate**; nessuna modifica live è stata eseguita. I passaggi di deploy rimangono separati e subordinati all'inventario dei servizi esistenti.

## 7. Aggiornare le Rules direttamente da GitHub
La nuova procedura senza chiavi service-account JSON è documentata in [`firestore-rules-github-deploy.md`](firestore-rules-github-deploy.md). Prima fare audit live e verificare `/users`, poi configurare WIF e usare l'environment `firestore-production` per il primo cutover consapevole. Il deploy resta indipendente da Hosting e non avviene automaticamente dopo merge.
