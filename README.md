# Piante

Piante è una PWA botanica **offline-first**, con un'area privata per gestire la propria collezione e una vetrina pubblica per condividere singoli esemplari.

**Stato:** M3a — shell pubblica e prototipo privato **riservato ai test**; persistenza locale su IndexedDB. Login e archivio non sono attivi per default e non è collegata alcuna sincronizzazione Firebase live.

- Repository nuovo: `gernotfound/piante`.
- Riferimento tecnico: `gernotfound/logbook` (principi tecnici); **nessun import né adattamento da Pianta**.
- Hosting desiderato: `https://piante.web.app` sul sito Firebase `piante` nel progetto `pianta-db`.
- Nessun deploy automatico, nessuna scrittura Firebase e nessuna API di backend prevista in M0.
- Nessun Google Analytics o tracciamento di utilizzo integrato.

## Rotte previste

| Rotta | Destinazione |
| --- | --- |
| `/` | Introduzione pubblica |
| `/app` | Area personale (in M0 segnaposto) |
| `/:username/public` | Vetrina pubblica (in M0 segnaposto) |
| `/:username/public/:slug` | Scheda pianta pubblica (in M0 segnaposto) |

Nessuna pagina M0 interroga Firestore. La pubblicazione reale sarà sviluppata soltanto dopo le Security Rules e i relativi test.

## Avvio

Node.js 24 e npm 11:

```sh
npm ci
npm run dev
```

Verifiche:

```sh
npm run verify
npm run test:e2e
```

La build `npm run build` genera anche le icone PWA a partire da `assets/icon.svg`.
Gli asset generati sono esclusi dal repository.

## Documentazione

- [AGENTS.md](AGENTS.md) — invarianti e procedure per agenti e manutentori.
- [Architettura](docs/architecture/overview.md).
- [Confine pubblico/privato e dati](docs/architecture/data-privacy.md).
- [Distribuzione Firebase](docs/operations/deployment.md).
- [Registro dei servizi esterni](docs/operations/external-services-register.md) — iscrizioni, domini, configurazioni, costi, evidenze e modifiche.
- [Regola sulle integrazioni esterne](.agents/rules/external-services.md).

## Sicurezza dello sviluppo

Il prodotto Piante **parte da zero**: non importa dati, backup, schemi o Rules della vecchia Pianta. Il progetto Firebase `pianta-db` mostra ancora risorse precedenti: **non eliminare documenti/UID o cambiare Rules live senza audit provider e autorizzazione specifica**. Nessun deployment automatico è previsto.

La pipeline di verifica non usa segreti o credenziali Firebase reali. Solo una modifica verificata e approvata potrà successivamente attivare la distribuzione.


## M1 — Fondamenta del dominio offline

Il modulo botanico dispone ora di schemi runtime Zod, operazioni di dominio e una repository locale IndexedDB con journal atomico. **Non è ancora collegato all'interfaccia, all'autenticazione o a Firestore.** L'area `/app` continua a mostrare un segnaposto fino alle milestone UI e account.

Vedi [contratto di persistenza locale](docs/architecture/offline-storage.md) per recovery, versioni e limiti.

## M2a: autenticazione sperimentale e confini cloud
La nuova web app può usare Google Auth con `piante.web.app` come `authDomain`, ma la modalità test è disabilitata per default. Non viene letta alcuna scheda privata e non viene effettuata alcuna scrittura live.
Le Rules `firestore.m2-test.rules` vengono validate con Firebase Emulator tramite `npm run test:rules`, **mai distribuite automaticamente sul progetto live**.
Prima di abilitare il login è obbligatoria la configurazione OAuth esterna e la verifica del sito.

## M2b: trasporto cloud di laboratorio
È disponibile un adapter Firestore per append idempotente del journal privato, con test Firebase Emulator. **Non è ancora una sincronizzazione funzionante**, non è abilitato nella PWA e le Rules di laboratorio non vanno distribuite su `pianta-db`. Vedi [contratto cloud](docs/architecture/cloud-journal.md).


## M2c: verifica di convergenza read-only
Disponibile una *anteprima* di riconciliazione fra journal locale e operazioni remote, con lettura server bounded e test Emulator. Non viene modificato lo stato locale, non vengono confermati upload e non esiste ancora un sync bidirezionale. Vedi [contratto cloud](docs/architecture/cloud-journal.md).


## M2d: recupero offline da Firestore, ancora in laboratorio
È ora possibile testare un ripristino persistente da receipt remoti con verifica owner, CAS e salvataggio atomico in IndexedDB; i device convergono per modifiche non conflittuali. Il journal locale rimane durevole e il codice **non viene eseguito nella PWA distribuita**. Il trasporto completo richiede checkpoint, gestione conflitti, quota Spark, ciclo account e audit Rules live. Leggi [`cloud-journal.md`](docs/architecture/cloud-journal.md).


## M2e: ciclo privato cloud (solo laboratorio)
L'orchestratore dei batch invia operazioni pending da IndexedDB, verifica dopo ogni batch i receipt Firestore e riparte senza duplicare le operazioni già confermate. Offline e conferme di rete ambigue sono espliciti e non eliminano le pending. Funziona per test unitari/Emulator, con limite 200 receipt: **non è una sync generale attiva sul sito**.

## M3a — Collezione privata locale dietro login sperimentale
Solo con `VITE_AUTH_TEST_MODE=true`, configurazione Google Auth valida e risposta positiva del grant `piante_access/{uid}.enabled` viene montato `PrivateGarden`. La schermata gestisce primi esemplari, luoghi, diario e stato delle piante tramite `LocalGardenRepository.commit()`, senza scrivere su Firestore. In caso di errore la UI non dichiara salvata un'operazione che non ha raggiunto IndexedDB.

**AVVERTENZA:** questi dati esistono solo nel browser corrente; la cancellazione dei dati locali può distruggerli. Non sono previsti backup, esportazione, recupero cross-device o dati pubblici nell'interfaccia M3a. Non usare informazioni reali importanti finché il lifecycle dati non è operativo. Questo modulo viene visualizzato soltanto agli utenti di test autorizzati; la modalità test rimane **false** nel deployment di default. Nessuna credenziale OAuth o apertura registrazioni aggiunta.

## M8e — relazioni fra piante della collezione
Nell'archivio privato di prova puoi associare a ogni esemplare una pianta madre e/o una pianta padre già registrate, sia durante la creazione (per esempio una talea) sia successivamente. I collegamenti usano ID stabili e la vista riflette le rinomine senza duplicare la genealogia. Il dominio blocca riferimenti mancanti, autogenitorialità e cicli; creazione e modifiche sono protette da revisioni IndexedDB. Nessuna parentela viene resa pubblica o inviata a Firestore live.

## M8d — storico completo del diario in locale
L'area privata di laboratorio mostra l'intero storico delle attività botaniche, con filtri per pianta e tipo di evento e pagine da dieci registrazioni. È una consultazione sola lettura dei dati IndexedDB già salvati: nessuna scrittura cloud, ulteriore journal, duplicazione di dati o modifica dello schema. Note e dati restano privati e limitati alla modalità test autorizzata.

## M8c — misurazioni e raccolto nel diario privato
Il diario sperimentale ora registra altezza in cm, pH del terreno e raccolto in grammi tramite il journal locale Piante. I campi si mostrano soltanto per le rispettive attività, sono facoltativi e verificati contro i limiti del dominio, e vengono presentati con unità dopo il reload. L'inserimento rifiuta revisioni IndexedDB obsolete fra schede. Restano **private-only**, senza cloud né pubblicazione.

## M3b — backup manuale e recovery offline per account test
La UI privata di prova offre l'export JSON completo del database locale (schede, eventi, luoghi, journal e receipt) e import con verifica checksum, anteprima e conferma. **Attenzione:** il file è in chiaro e non viene protetto con password; conservalo al sicuro. Il ripristino è permesso solo sullo **stesso account** in un archivio vuoto. Un backup importato resta in **quarantena cloud**, anche se consente modifiche locali, fino a una futura migrazione sicura. Nessun backup automatico o ripristino cloud live è disponibile.


## M3c — sicurezza del ciclo di cancellazione (solo laboratorio)
Il repository include un modello testato di cleanup amministrativo riprendibile con tombstone e blocco delle scritture concorrenti. **Non è collegato a un server**, non cancella account reali e non permette al client di cancellare dati Firestore. Firebase Auth non viene rimosso dal runner Piante; la cancellazione account futura richiede un backend trusted e una procedura end-to-end. Consulta `.agents/rules/account-lifecycle.md` per vincoli e prerequisiti prima dell'apertura a nuovi utenti.


## M3e — controllo di sicurezza delle build statiche
Prima di produrre `dist/`, la build controlla che il progetto Firebase sia `pianta-db`, che sia configurato **solo Hosting statico sul sito `piante`**, che siano presenti gli header di sicurezza e che il login test non sia abilitato. Lo stesso confine è testato da `npm run test:release-boundary` e da un job Canonical Verification indipendente. Non viene pubblicato niente automaticamente; il risultato non sostituisce l'audit live di Firebase.


## M3f — invalidazione continua dell'accesso privato (solo account test)
La prova del grant `piante_access/{uid}` deve ora essere **da server** e rimane osservata mentre la sessione di test è aperta. Revoca, cache/offline, errori e cambi di account chiudono immediatamente la UI al verificarsi del relativo evento; il controller impedisce che vecchi callback la riaprano. Non vengono cancellati né cifrati i dati locali. Questo non apre registrazioni, non distribuisce Rules e non abilita Auth in una build: il flag di login test rimane disattivato di default e bloccato dal guard di release M3e.


## Greenfield — nessuna compatibilità Pianta

Su decisione esplicita del product owner (2026-10-21), Piante non importa i dati dell'app precedente e **non dispone più di fixture, converter o test di convivenza Pianta**. La CI conserva `npm run test:rules` e tutti i controlli Piante owner/anonimo/cross-user/tombstone/revoca, incluso il diniego del vecchio percorso `users/{uid}`.

Le Rules di laboratorio **non sono** le Rules live di Firebase e non vengono distribuite. Per lo stato dei provider, verifiche e pulizia esterna delle risorse preesistenti: [registro servizi](docs/operations/external-services-register.md).
