# Processo di verifica e rilascio

## Prima di una modifica
- Leggere `AGENTS.md` e le regole pertinenti, il codice/repository `main` reale e le dipendenze/test. Non importare automaticamente codice da LogBook.
- Identificare rischi STANDARD/SENSITIVE/CRITICAL. Auth, Rules, scritture private/pubbliche, provider e dati sono **CRITICAL**.
- Individuare cause radice, chiamanti, failure path e regressioni. I test verdi non sostituiscono il ragionamento sul contratto.

## CI candidata
- **Static & unit checks:** `npm run verify`, sintassi Node ES modules, Hosting target `piante`, assenza PWA e deploy automatici.
- **Firestore Rules Emulator:** suite `tests/emulator.test.mjs` nel progetto demo; Java, Firebase CLI e SDK di test installati nel workflow. L'Emulator deve validare azioni consentite e negazioni; non è una prova delle Rules in produzione.
- **Responsive browser smoke:** Chromium + WebKit a 320/375/768/1440px, con config Firebase inattiva su localhost; i test Node coprono validazione e bootstrap JSON stesso-origin e errori login Google. Non dimostrano OAuth reale, dati reali o compatibilità con ogni Safari/iPhone reale.
- La vecchia `Canonical Verification` della PWA è stata rimossa durante il reset; **VERIFY** nella pagina GitHub che i required checks correnti siano appropriati. Evitare workflow che dichiarino verde uno SHA differente dal candidato.

## Comandi di lavoro
- Node.js 22+, `npm run verify` per test unitari e controlli statici; `node --check web/scripts/*.mjs` (espandere in shell) per sintassi.
- Smoke UI in Chromium/WebKit e Rules Emulator eseguiti nella GitHub Actions `.github/workflows/verification.yml`.
- Per anteprima statica senza Auth: `python3 -m http.server 8080 --directory web`, poi `http://localhost:8080`. Questo non implica accesso reale Firebase.

## Pubblicazione (non ancora autorizzata)
1. Verificare i provider live: dominio, Web App, authDomains/OAuth, App Check, IAM, Rules e indici Firestore, vecchio namespace.
2. Rendere utilizzabile la Web App config verificata, grant approvato per account di test, e blocco degli account non autorizzati.
3. Rieseguire CI sull'esatto SHA e verificare in browser sia schede private sia visibilità anonima, inclusi revoca, filtri, reload, cambi sessione e foto.
4. Preparare rollback: commit Hosting precedente, Rules live/versione compatibile, dati/backup se coinvolti. Mai provare a invertire eliminazioni di dati con un rollback del frontend.
5. Distribuire Hosting/Rules soltanto dopo revisione del target e delle risorse. `firebase.json` contiene **solo Hosting**, quindi le Rules richiedono deployment separato e deliberato.
6. Verificare read-back, HTTP e runtime. Registrare evidenza in `docs/firebase-configurazione.md`.

## Cancellazione account
L'eliminazione completa delle identità e dei dati attraverso profili, handle, schede pubbliche, tag e file statici **non** è implementata. Non aprire registrazioni pubbliche con utenti arbitrari finché non è progettata e provata una procedura trusted riprendibile. Non eliminare dati reali della vecchia Pianta a seguito di questa nuova UI.

## Bootstrap Firebase dal dominio corretto
Su `https://piante.web.app` usare solamente il JSON riservato `/__/firebase/init.json` con `projectId === pianta-db`; nessuna inizializzazione per altri progetti o in presenza di config parziali. L'endpoint è di Hosting, non delle Rules. Verificare `GET` e Content-Type **dal dominio reale** prima di qualunque deploy, senza stampare la API key nei log di CI. Mancata risposta / mismatch = accesso non disponibile (fail closed), non fallback a `pianta-db.web.app`.

## Controllo pubblico di readiness (sola lettura)
- Script: `npm run check:hosting`; workflow manuale `.github/workflows/hosting-readiness.yml`. Non richiede credenziali Firebase e NON distribuisce nulla.
- Il controllo esamina soltanto homepage/headers, modulo JS pubblico e `/__/firebase/init.json` sul sito `https://piante.web.app`. Verifica l'identità del progetto ma non scrive o divulga i valori della configurazione Web.
- Prima del primo deploy un FAIL è atteso; un PASS non certifica l'accesso Google né le Rules live.
- Controllare i provider con accesso autorizzato prima di effettuare qualunque deploy; istruzioni in `docs/operations/firebase-release.md`.
