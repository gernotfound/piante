# Architettura attuale — Piante

**Stato:** redesign Mobile First, gestione concorrente dell'inventario e automazione CI → Firestore Rules → Hosting risultano integrati in `main` fino alla PR #14. I filtri botanici avanzati sono candidati su branch separato: richiedono aggiornamento delle Rules prima di Hosting.

## Obiettivo

Sito pubblico del futuro vivaio e area privata amministrativa: Home, Piante, Chi siamo, Contatti, login e inventario.

## Componenti

- `index.html` e `styles.css`: interfaccia statica responsive.
- `src/main.js`: routing, Firebase Web SDK, form, login, navigazione pubblica e gestionale, visualizzazione e sincronizzazione client.
- `src/catalog.js`: ricerca botanica locale, classificazione fruttifere e filtri puri riutilizzati dal catalogo pubblico e dall'inventario, testabili senza dipendenze Firebase.
- `src/plant-store.js`: transazioni atomiche su inventario e catalogo, protezione contro modifiche concorrenti e versioni delle schede.
- `docs/design/mobile-first.md`: decisioni visual e limiti di supporto ai browser datati.
- `src/domain.js`: validazione, escaping, classificazioni botaniche e proiezione allowlist pubblicabile dei dati.
- `src/config.js`: valori pubblici della Web App Firebase (non credenziali amministrative).
- `firestore.rules`: controlli server-side per i documenti.
- `firebase.json` e `.firebaserc`: target Hosting `piantee`, Rules e configurazione emulatori.
- `.github/workflows/ci.yml`: test sintattici/unitari/Rules su branch/PR.
- `.github/workflows/deploy-firestore-rules.yml`: riconcilia e verifica le Rules dopo la CI verde di `main`, con identità WIF dedicata.
- `.github/workflows/deploy-production.yml`: pubblica solo Hosting dopo il successo della fase Rules sullo stesso commit.

## Confini dei dati

- `siteOwner/primary`: UID amministratore configurato solo tramite console privilegiata.
- `privatePlants/{id}`: inventario privato, inclusi `internalNotes`, stato di pubblicazione, etichetta facoltativa del singolo esemplare, modalità di propagazione, origine del materiale, dettagli della provenienza, data di semina, posizione e sesso accertato quando pertinente. Il documento mantiene il proprio ID Firestore come codice stabile `PI-{id}` senza nuovi contatori o collezioni.
- `catalog/{id}`: soli dati pubblici scelti dalla `catalogProjection`; consultazione senza login. I nuovi metadati dell’esemplare sono esclusi dal catalogo. La categoria resta il controllo visibile nell’editor; `plantGroup` è derivato per compatibilità con le schede e i filtri esistenti. Le selezioni rapide si limitano alle specie verificate e non attribuiscono cultivar ai semenzali.
- `adminProfiles/{uid}` e `loginAliases/{username}`: nome utente opzionale per il login. Un alias noto può rivelare l'email.
- Firebase Authentication: credenziali/sessioni (nessuna password nel database).

## Limiti consapevoli

Il frontend non dispone di un backend affidabile server-side per autorizzazioni diverse dalle Security Rules. L'area privata può gestire soltanto l'inventario del proprietario e non include acquisti, pagamenti, ordini o upload foto. Le immagini esterne possono smettere di funzionare.

I test di integrazione con Firestore Emulator esercitano la persistenza con Rules (creazione, pubblicazione, rimozione e conflitti). Il test browser E2E usa Chrome, Auth Emulator, Firestore Emulator e riscrive **solo nel server di prova** la configurazione Firebase e il bootstrap degli emulatori: non esegue alcuna scrittura sul progetto reale. Resta necessario un controllo manuale su dispositivi fisici e, per lo stato di produzione, uno smoke test non distruttivo separato.
