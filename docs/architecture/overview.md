# Architettura attuale — Piante

**Stato:** il redesign commerciale Mobile First e l'automazione CI → Firestore Rules → Hosting sono integrati in `main`. Gli interventi di concorrenza del gestionale sono verificati separatamente su PR prima di ogni rilascio.

## Obiettivo

Sito pubblico del futuro vivaio e area privata amministrativa: Home, Piante, Chi siamo, Contatti, login e inventario.

## Componenti

- `index.html` e `styles.css`: interfaccia statica responsive.
- `src/main.js`: routing, Firebase Web SDK, form, login, navigazione pubblica e gestionale, visualizzazione e sincronizzazione client.
- `src/catalog.js`: filtri puri riutilizzati da catalogo pubblico e inventario, testabili senza dipendenze Firebase.
- `src/plant-store.js`: transazioni atomiche su inventario e catalogo, protezione contro modifiche concorrenti e versioni delle schede.
- `docs/design/mobile-first.md`: decisioni visual e limiti di supporto ai browser datati.
- `src/domain.js`: validazione, escaping e proiezione pubblicabile dei dati.
- `src/config.js`: valori pubblici della Web App Firebase (non credenziali amministrative).
- `firestore.rules`: controlli server-side per i documenti.
- `firebase.json` e `.firebaserc`: target Hosting `piantee`, Rules e configurazione emulatori.
- `.github/workflows/ci.yml`: test sintattici/unitari/Rules su branch/PR.
- `.github/workflows/deploy-firestore-rules.yml`: riconcilia e verifica le Rules dopo la CI verde di `main`, con identità WIF dedicata.
- `.github/workflows/deploy-production.yml`: pubblica solo Hosting dopo il successo della fase Rules sullo stesso commit.

## Confini dei dati

- `siteOwner/primary`: UID amministratore configurato solo tramite console privilegiata.
- `privatePlants/{id}`: inventario privato, inclusi `internalNotes` e stato di pubblicazione; il redesign non ne modifica la forma.
- `catalog/{id}`: soli dati pubblici scelti dalla `catalogProjection`; consultazione senza login.
- `adminProfiles/{uid}` e `loginAliases/{username}`: nome utente opzionale per il login. Un alias noto può rivelare l'email.
- Firebase Authentication: credenziali/sessioni (nessuna password nel database).

## Limiti consapevoli

Il frontend non dispone di un backend affidabile server-side per autorizzazioni diverse dalle Security Rules. L'area privata può gestire soltanto l'inventario del proprietario e non include acquisti, pagamenti, ordini o upload foto. Le immagini esterne possono smettere di funzionare.

I test di integrazione con Firestore Emulator esercitano il flusso completo di persistenza con Rules (creazione, pubblicazione, rimozione e conflitti). Non costituiscono E2E browser: occorre ancora collaudare UI Mobile First, login reale, conservazione degli input, pubblicazione e logout su un ambiente controllato senza modificare l'inventario di produzione.
