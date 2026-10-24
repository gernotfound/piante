# Firebase e servizi esterni — sicurezza, configurazione e stato

## Fonte di verità
- Target **dichiarato**, non verificato: progetto `pianta-db`, Hosting site `piante`, dominio `https://piante.web.app`; Firestore `(default)` in `europe-west12` secondo immagini della Console di ottobre 2026.
- I riferimenti storici si trovano in [`docs/firebase-configurazione.md`](../../docs/firebase-configurazione.md). Il file `.firebaserc` e `firebase.json` mostrano la **configurazione candidata**, non le risorse correnti sul provider.
- Il repository GitHub è pubblico; non salvare token, UID, credenziali IAM, documenti personali, env reali o screenshot sensibili.

## Auth e Web App
- Solo **Google OAuth** nell'interfaccia `/login`. Secondo la Console storica era abilitato anche Email/Password: non disabilitarlo senza inventario delle altre applicazioni e dei client ancora in uso.
- Verificare in Firebase Console: registrazione della Web App, API key pubblica e App ID, Project ID, Auth Domain, domini autorizzati, origin JS e redirect `https://piante.web.app/__/auth/handler`.
- La Web config pubblica appartiene a `web/firebase-config.mjs` (appId/apiKey attualmente vuoti): non sostituirla con credenziali admin. Modificare i valori solo dopo conferma della Web App corretta e dell'effettivo dominio OAuth.
- È possibile autenticarsi con Google e **non** essere autorizzati. Solo un grant amministrativo `access_grants/{uid} = {enabled:true}` concede accesso privato tramite le Rules. Non creare un'interfaccia che permetta all'utente di autoconcedersi permessi.
- L'autorizzazione viene accertata dalle Rules server-side e non da un flag frontend. In caso di errore/revoca la UI non deve esporre nuovi dati o dichiarare riuscite mutazioni negate.

## Firestore e rilascio
- `firestore.rules` è una candidata testata tramite Emulator. `firebase.json` contiene solo Hosting, senza `firestore`, per impedire un deploy Rules accidentale.
- Un eventuale aggiornamento delle Rules live negherà esplicitamente il vecchio namespace `users`: **non distribuire senza prima leggere la versione live, inventariare il contenuto e valutare gli altri client ancora dipendenti**.
- Test Emulator e CI non equivalgono a read-back live. Dopo un rilascio autorizzato, verificare effettivamente Firebase Auth, Firestore, Hosting e permessi del browser.
- Quote, App Check, IAM, metodi Auth, Web config e versioni Rules sul provider non sono ancora verificati con accesso live in questa fase.

## Piani/costi
- **MUST:** restare compatibile con Spark e Hosting statico; non attivare Blaze, Storage, Functions o provider a pagamento senza un'autorizzazione esplicita.
- Cloud Storage for Firebase richiede Blaze dal 3 febbraio 2026, anche se il livello gratuito Blaze potrebbe avere quote a costo zero; non è utilizzabile senza billing abilitato.
- Nessun servizio Vercel per Piante. Il precedente progetto Vercel è stato dichiarato eliminato dall'utente, non verificato qui in lettura provider.
- Google Analytics e telemetria comportamentale non integrate.

## Check di rilascio
Leggere `docs/firebase-configurazione.md`, verificarne lo stato provider, approvare la migrazione delle Rules e le eventuali cancellazioni irreversibili come interventi **separati**, poi provare login reale, owner, pubblico anonimo, revoca e foto. Registrare data, prova e limiti senza scrivere nuovi passaggi nel README.
