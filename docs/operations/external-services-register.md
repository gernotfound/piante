# Registro dei servizi esterni — Piante

> Aggiornato: **2026-10-21**. Repository GitHub pubblico: non inserire email, UID, documenti Firestore, immagini personali, token, segreti, credenziali, screenshot privati o backup.
>
> Segue il modello operativo di `gernotfound/logbook`. Le fonti sono distinte: `GITHUB-OBSERVED` (codice/CI GitHub), `USER-SCREENSHOT` (immagine della Console), `USER-REPORTED` (dichiarazione), `PROVIDER-OBSERVED` (verifica diretta con il provider competente, **non effettuata per Firebase**), `NOT-VERIFIED` (dato ancora da verificare).

## Decisione di prodotto: dati Piante nuovi, nessuna migrazione Pianta

Il product owner ha deciso il **2026-10-21** di dismettere la vecchia Pianta e realizzare **Piante da zero, senza importazione o conversione di alcun dato Pianta**. Ha dichiarato di non avere nulla da esportare e ha chiesto di rimuovere i riadattamenti. Non serve nessun workflow di export/import, doppia scrittura, compatibilità delle Rules o conversione dello schema Pianta. Lo sviluppo futuro riguarda esclusivamente il dominio Piante.

**Stato reale:** `NO-MIGRATION / CLEANUP-PENDING`. Le risorse legacy sono ancora osservate nella Console e nel repository storico: non sono state eliminate, non esiste prova di dismissione esterna. La dichiarazione dell'utente di non avere dati da trasferire non prova che Firestore o Firebase Auth siano vuoti. Non cancellare documenti, identità, Rules o siti tramite refactoring GitHub; ogni pulizia live irreversibile richiede identificazione delle risorse sul provider e autorizzazione specifica. Nessuna attivazione Blaze/pagamento implicita.

## Inventario attuale

| Sistema | Stato per Piante | Scopo e vincoli | Evidenza |
| --- | --- | --- | --- |
| GitHub `gernotfound/piante` | `ACTIVE` sviluppo | repository pubblico, branch, PR, review, SHA verificati | `GITHUB-OBSERVED` |
| GitHub Actions, CodeQL e `main` protetto | `ACTIVE` CI, **non** deploy | Core, Playwright, Firestore Emulator **solo Piante**, release boundary, CodeQL, Canonical; nessun bypass del gate | `GITHUB-OBSERVED` |
| Firebase/GCP Project ID `pianta-db` (nome Piante) | `CONFIGURED-NOT-ACTIVE` per cloud della nuova PWA | unico progetto target, infrastruttura precedente ancora presente, ambiente sviluppo/test; piano Spark, no Blaze | `USER-SCREENSHOT`, `USER-REPORTED`; configurazioni API da verificare |
| Cloud Firestore `(default)` `europe-west12` | `CLEANUP-PENDING` vecchio namespace, `CONFIGURED-NOT-ACTIVE` nuovo | Piante usa futuri `piante_users`, `piante_access`; niente import da `users` | `USER-SCREENSHOT` 2026-10-21, inventario completo non provato |
| Firestore Security Rules e indici | `VERIFY-LIVE` | Rules incollate dall'utente permettono `users/{uid}`, non nuovi path Piante; il fixture `firestore.m2-test.rules` è **solo Emulator**, mai deploy diretto | `USER-REPORTED` Rules + `GITHUB-OBSERVED` fixture, nessuna read-back API |
| Firebase Authentication | Provider Email/Password e Google **riferiti abilitati**; UI Piante `CONFIGURED-NOT-ACTIVE` | un account test secondo utente, numero account non confermato da provider; signup non aperto prima della cancellazione account sicura | `USER-REPORTED` 2026-10-21; test-only nel codice |
| Firebase Hosting `piante`, `https://piante.web.app` | `CONFIGURED-NOT-ACTIVE / VERIFY-LIVE` | target PWA e OAuth handler, deploy manuale/pipeline ancora disabilitati | `GITHUB-OBSERVED` config, `USER-REPORTED` per sito; runtime non verificato |
| Firebase Auth authorized domains | `CONFIGURED-NOT-ACTIVE / VERIFY-LIVE` | screenshot storico include `localhost`, `pianta-db.firebaseapp.com`, `pianta-db.web.app`, `pianta-gnf.vercel.app`, `piante.web.app` | `USER-SCREENSHOT` 2026-10-08; origini legacy non più richieste per Piante ma pulizia provider separata |
| Google OAuth Web client | `VERIFY-LIVE` | redirect `https://piante.web.app/__/auth/handler`; aggiunta origin JavaScript `https://piante.web.app` dichiarata salvata dall'utente 2026-10-08; non verificato login reale | `USER-SCREENSHOT` / `USER-REPORTED`, nessun token nel repo |
| Firebase Browser API key | `VERIFY-LIVE` | restrizioni HTTP referrer e restrizioni API dichiarate; controllare `https://piante.web.app/*` prima della release; non pubblicare valori non necessari | `USER-SCREENSHOT` 2026-10-08 |
| Google Cloud IAM / service accounts | `VERIFY-LIVE` | nessun grant o WIF production ancora verificato; usare privilegi minimi, no chiavi JSON su GitHub | `NOT-VERIFIED` |
| Firebase App Check | `VERIFY-LIVE` | screenshot mostra banner “Configura App Check”, non è una prova che enforcement sia attivo/disattivo | `USER-SCREENSHOT` 2026-10-21 |
| Firebase Storage | `NOT-INTEGRATED` | eventuali immagini future richiedono audit quote/privacy; nessun deploy automatico | `GITHUB-OBSERVED` |
| Cloud Functions / servizi Blaze | `NOT-INTEGRATED` | non aggiungere costi senza consenso | vincolo di prodotto |
| Google Analytics / GA4 | `NOT-INTEGRATED` | nessun tracking nel nuovo progetto | vincolo di prodotto |
| Vercel / `https://pianta-gnf.vercel.app` | `CLEANUP-PENDING` per vecchia Pianta, **non integrato** in Piante | dismissione esterna desiderata ma sito ancora non verificato sul provider; non collegare CI Piante | `GITHUB-OBSERVED` README legacy; `NOT-VERIFIED` provider |
| Google Search Console, Sentry, Snyk | `NOT-INTEGRATED` | introdurre soltanto su necessità e con valutazione privacy/costo | repository Piante |

## Evidenza Firestore legacy ricevuta dall'utente

- Il **2026-10-21** lo screenshot della Console mostra `Cloud Firestore > Database (default)`, regione `europe-west12`, radice `users` e, nel documento selezionato, sottocollezioni `plants` e `images`. Sono visibili alcuni campi root. Non sono stati memorizzati ID del documento, coordinate, contenuti o screenshot nel repo.
- L'utente ha incollato le Rules effettivamente visualizzate in Console. Il vecchio blocco `users/{uid}` permette owner read/write secondo schema parzialmente validato; non è una prova autonoma della versione pubblicata. Il nuovo percorso Piante è ancora assente dalle Rules riportate.
- Un solo account test e metodi Email/Password+Google sono `USER-REPORTED`, **non** inventario Firebase Auth verificato. Nessun elenco account o email viene committato.
- L'utente **non intende utilizzare o esportare** dati Pianta nel prodotto Piante. Non creare moduli per importare il loro JSON, neppure opzionali, né riutilizzare il vecchio account come prova di onboarding riuscito.

## Cambiamenti e controlli per servizi esterni

1. Prima di operare su Firebase, ottenere dall'operatore/provider corretto una verifica live di Rules/versione, collezioni e sottocollezioni, indici, Auth e metodi, IAM, OAuth/referrer, Hosting, App Check e quote Spark. Screenshot e codice non sostituiscono una risposta provider.
2. Definire una procedura nuova e separata per **l'eventuale pulizia del vecchio account test e dei vecchi dati**: identificazione esatta dei target, assenza di dipendenze, cancellazione reversibile o approvazione specifica dei passi irreversibili, verifica post-intervento. Non condizionarla a una migrazione, perché **non ce ne sarà una**.
3. Configurare le nuove Rules Piante in percorso distinto dalla configurazione Hosting, con suite Emulator owner/anonimo/cross-user/revoca e deny `users`; mai distribuire direttamente il fixture.
4. Non collegare login o sync alla UI pubblica finché recovery offline, causalità cloud, lifecycle account, prevenzione abusi e cleanup affidabile non sono verificati; non usare un CI verde per affermare runtime funzionale.
5. GitHub: branch dedicato, PR Draft durante modifiche, required checks sullo SHA esatto, review, squash merge e CI su `main`. Le modifiche live richiedono verifica provider e registrazione dell'esito qui.

## Cronologia delle decisioni

| Data | Decisione o evento | Evidenza | Esito |
| --- | --- | --- | --- |
| 2026-10-08 | `piante.web.app` tra domini Firebase Auth autorizzati; OAuth callback visibile | `USER-SCREENSHOT` | Da verificare sul provider e collaudare |
| 2026-10-08 | Origin OAuth `https://piante.web.app` dichiarata aggiunta al client Web esistente | `USER-REPORTED` | Verifica provider ancora aperta |
| 2026-10-09 | Rules `users/{uid}` del vecchio Pianta copiate dalla Console | `USER-REPORTED` | Nessuna nuova Rules Piante distribuita |
| 2026-10-21 | Screenshot Firestore `(default)`, `europe-west12`, `users`, `plants` e `images` | `USER-SCREENSHOT` | Risorse vecchie visibili; non presumere database vuoto |
| 2026-10-21 | Email/Password e Google abilitati, un solo test account dichiarato | `USER-REPORTED` | Verifica Auth e safety lifecycle aperte |
| 2026-10-21 | Pianta da dismettere, ma nessun dato da esportare/riusare, **Piante greenfield** | `USER-REPORTED` | **Nessuna migrazione né retrocompatibilità**; rimuovere adattamenti dal codice, non dati provider automaticamente |
| 2026-10-21 | Rimozione da GitHub del harness di compatibilità legacy, mantenendo il gate Firestore Emulator Piante | `GITHUB-OBSERVED` soltanto dopo PR/CI/merge | Stato esterno invariato, nessun deploy |

## Scheda obbligatoria per nuovi provider

Annotare fornitore, scopo, piano/quote/costo, dati/privacy, ambiente, configurazioni non segrete, data/fonte verificata, permessi/deploy, stato live distinto da stato GitHub, rischi, dipendenze e piano di rollback. Non inserire mai valori privati in un registro pubblico.
