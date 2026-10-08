# Registro dei servizi esterni — Piante

> Avviato: **2026-10-08**. Repository **pubblico**; niente credenziali, client secret, email private o screenshot di console committati.
>
> Fonti: codice GitHub, verifiche GitHub effettive e screenshot/dichiarazioni del product owner. Questo documento **non** prova che la configurazione Firebase/Google Cloud sia stata interrogata direttamente tramite API.

## Scopo e legenda

Registro permanente delle iscrizioni e integrazioni esterne della PWA Piante, ispirato al registro di TheLogBook e aggiornato quando un provider cambia.

- `ACTIVE`: codice/CI effettivamente operativi nel perimetro indicato, non implica deploy del frontend.
- `CONFIGURED-NOT-ACTIVE`: predisposto ma non attivato o non collaudato.
- `LEGACY`: necessario, o potenzialmente necessario, a **Pianta**, app distinta sullo stesso Firebase.
- `OPTIONAL`: non indispensabile e da decidere.
- `NOT-INTEGRATED`: non usato dalla nuova Piante.
- `VERIFY-LIVE`: richiede lettura/verifica direttamente sul provider.
- Evidenza `GITHUB-OBSERVED`, `USER-SCREENSHOT`, `USER-REPORTED`, `PROVIDER-OBSERVED`, `NOT-VERIFIED`. Una schermata del product owner è evidenza di ciò che era visibile *al momento dello screenshot*, non una verifica live eseguita dall'AI.

## Inventario e scopo

| Provider / servizio | Stato Piante | Perché serve | Piano/costo e privacy | Evidenza e limite |
| --- | --- | --- | --- | --- |
| GitHub, repository `gernotfound/piante` | **ACTIVE** per sviluppo | codice pubblico, branch, PR, revisioni, release | repository pubblico; non inserire dati personali/secret | `GITHUB-OBSERVED`, 2026-10-08 |
| GitHub Actions + CodeQL | **ACTIVE** per CI, non per deploy | Canonical Verification exact-SHA, controlli security, Emulator | GitHub pubblico; costi non assunti | `GITHUB-OBSERVED`; CI su main verificata |
| GitHub branch protection `main` | **ACTIVE** | PR e gate obbligatori | amministrazione GitHub esterna | `GITHUB-OBSERVED` sul flag protected; dettagli regola da riesaminare se cambia |
| Firebase Project `pianta-db` / Google Cloud, display name **Piante** | **LEGACY + CONFIGURED-NOT-ACTIVE** per nuova app | progetto condiviso con Pianta, identità e dati | Firebase Spark mostrato; **no Blaze senza consenso** | `USER-SCREENSHOT` 2026-10-08; non sono state interrogate IAM/risorse live |
| Firebase Hosting site `piante`, `https://piante.web.app` | **CONFIGURED-NOT-ACTIVE / VERIFY-LIVE** | destinazione frontend PWA e OAuth helper | Hosting statico, target Spark | `USER-REPORTED` per site; deploy e handler HTTP non verificati |
| Firebase Authentication / Google | **CONFIGURED-NOT-ACTIVE / VERIFY-LIVE** | login Google previsto, accesso per account autorizzati | identità condivise col legacy; niente iscrizioni indiscriminate | `USER-SCREENSHOT` di Authorized domains; codice Auth M2a opt-in |
| Google Auth Platform — Web OAuth client Firebase | **CONFIGURED-NOT-ACTIVE / VERIFY-LIVE** | popup Google, origini consentite e callback OAuth | un client Google esistente condiviso: **non eliminare redirect legacy** | `USER-SCREENSHOT` + `USER-REPORTED` 2026-10-08; origine Piante aggiunta secondo il product owner, verifica diretta ancora aperta |
| Google Cloud — Browser API key Firebase | **LEGACY + VERIFY-LIVE** | API Firebase Web; referrer e API allowlist | chiave Web non equivale a credenziale amministrativa | `USER-SCREENSHOT`: restrizioni HTTP referrer e API visibili, valori non aperti |
| Cloud Firestore | **LEGACY + CONFIGURED-NOT-ACTIVE** per Piante | replica cloud futura, dati e Rules attuali di Pianta da preservare | quote Spark e privacy per utenti | `GITHUB-OBSERVED`: nuove Rules soltanto nel fixture Emulator |
| Firebase Security Rules / indici live | **VERIFY-LIVE** | enforcement reale del database condiviso | **non distribuire** le Rules `firestore.m2-test.rules` | nessun read-back diretto del provider |
| Google Cloud IAM / service account Firebase | **VERIFY-LIVE** | gestione privilegi provider, futuro WIF senza chiavi JSON | principio di minimo privilegio | `USER-SCREENSHOT`: service account visibile; nessun ruolo/IAM verificato |
| Firebase App Check / Fraud Defense | **VERIFY-LIVE** | eventuale protezione abusi futura | nessun enforcement affermato | configurazione non verificata |
| Firebase Storage | **NOT-INTEGRATED** nella nuova Piante | eventuali immagini in milestone futura | esaminare quote e privacy prima di usarlo | nessun accesso runtime nuovo |
| Google Analytics / GA4 | **NOT-INTEGRATED** (escluso) | nessun tracking richiesto | non abilitare senza decisione esplicita | vincolo di prodotto; nessun codice di tracking Piante |
| Vercel | **NOT-INTEGRATED** in Piante; app Pianta legacy separata | non deve effettuare deploy Piante | non rimuovere configurazioni della vecchia Pianta senza audit | esclusione da codice Piante e indicazioni di prodotto |
| Firebase Cloud Functions / servizi Blaze | **NOT-INTEGRATED** | backend a pagamento non autorizzato | piano Spark obbligatorio | vincolo di prodotto; nessuna nuova integrazione |
| Google Search Console / Sentry / Snyk | **NOT-INTEGRATED** | possibili sistemi futuri SEO, error tracking e security | opt-in, privacy/costi da valutare | nessuna registrazione o stato provider rivendicati |

## Firebase Authentication e OAuth — screenshot 2026-10-08

### Domini Firebase Auth

Nella schermata **Authentication → Impostazioni → Domini autorizzati** sono visibili:

- `localhost`;
- `pianta-db.firebaseapp.com` e `pianta-db.web.app` (domini predefiniti, da preservare);
- `pianta-gnf.vercel.app` (dominio legacy: non rimuovere senza audit);
- **`piante.web.app`** (Piante, già inserito).

**Evidenza: `USER-SCREENSHOT`.** Non è stato verificato direttamente il provider dopo lo screenshot.

### Google Auth Platform — client OAuth Web esistente

La schermata del client auto-creato da Google mostra stato **Attivato**, con origini JavaScript consentite:

- `http://localhost`;
- `http://localhost:5000`;
- `https://pianta-db.firebaseapp.com`.

**Cronologia:** nello screenshot iniziale non compariva l'origine JavaScript `https://piante.web.app`. Il **2026-10-08 il product owner ha confermato di averla aggiunta e salvata** nel client OAuth esistente, seguendo la procedura indicata. Evidenza: `USER-REPORTED`, **non** `PROVIDER-OBSERVED`; lo stato corrente del provider e la conservazione delle origini legacy richiedono verifica diretta.

Sono già mostrati come redirect autorizzati:
- `https://pianta-db.firebaseapp.com/__/auth/handler`;
- **`https://piante.web.app/__/auth/handler`**.

**Non creare un nuovo OAuth client per automatismo, non eliminare il callback legacy.** Il client ID e il client secret non sono copiati nel repository.

### Firebase Web app e flusso Piante

Il codice M2a vincola `VITE_FIREBASE_PROJECT_ID=pianta-db` e `VITE_FIREBASE_AUTH_DOMAIN=piante.web.app`, mentre `VITE_AUTH_TEST_MODE=false` per default. Nessun deploy del nuovo login, test browser reale o attivazione di nuovi account è stato osservato. **Il nome mostrato durante il login non cambia nella vecchia Pianta** solo perché è stata configurata la nuova PWA.

## Google Cloud — Browser API key

Nella schermata **API e servizi → Credenziali** è presente una chiave browser Firebase con indicazione di restrizione applicazione ai referrer HTTP e restrizioni API (25 API mostrate).

Non sono stati aperti/validati:
- i pattern completi dei referrer consentiti;
- l'eventuale referrer `https://piante.web.app/*`;
- la necessità effettiva di aggiornare la allowlist prima del deploy;
- i ruoli IAM del service account presente nella schermata.

**Nessuna chiave, segreto o email del service account è trascritta.** Le restrizioni reali vanno verificate sul provider prima di qualsiasi modifica.

## Eventi / decisioni tracciate

| Data | Provider | Evento | Evidenza | Stato / seguito |
| --- | --- | --- | --- | --- |
| 2026-10-08 | GitHub | M2a integrata su `main` (squash SHA `8dc84e52`): Auth test-only e suite Firestore Emulator; post-merge CI verde | `GITHUB-OBSERVED` | nessun deploy Firebase |
| 2026-10-08 | Firebase Auth | Screenshot del product owner conferma `piante.web.app` tra gli Authorized domains insieme ai domini legacy | `USER-SCREENSHOT` | aggiunta visibile; verifica diretta provider ancora aperta |
| 2026-10-08 | Google OAuth | Screenshot conferma il redirect `https://piante.web.app/__/auth/handler` tra quelli autorizzati | `USER-SCREENSHOT` | redirect visibile; OAuth runtime non collaudato |
| 2026-10-08 | Google OAuth | Screenshot antecedente alla modifica: l'origine `https://piante.web.app` non era presente | `USER-SCREENSHOT` | situazione storica, poi aggiornata dall'utente |
| 2026-10-08 | Google OAuth | Il product owner riferisce di aver aggiunto e salvato `https://piante.web.app` nelle origini JavaScript autorizzate del client OAuth Web esistente | `USER-REPORTED` | aggiunta dichiarata completata; conferma diretta del provider, origini legacy e prova login runtime ancora aperte |
| 2026-10-08 | Google Cloud | Browser API key con restrizioni ai referrer HTTP e lista API | `USER-SCREENSHOT` | valori referrer da ispezionare; nessuna modifica eseguita |
| 2026-10-08 | Documentazione | Introdotto registro pubblico e regola per future iscrizioni/integrazioni | `GITHUB-OBSERVED` dopo merge e CI | aggiornare a ogni cambio esterno |

## Verifiche aperte, priorità

1. **OAuth:** aggiunta di `https://piante.web.app` alle *Origini JavaScript autorizzate* **dichiarata completata dal product owner il 2026-10-08**. Verificare direttamente sul provider il salvataggio e la permanenza delle origini/callback legacy; quindi collaudare il login sulla nuova PWA quando sarà realmente distribuita.
2. **API key:** controllare la Browser key, includere il referrer `https://piante.web.app/*` **solo se necessario**, senza interrompere i referrer legacy.
3. **Hosting:** verificare che l'URL del sito e `/__/auth/handler` rispondano davvero, e associare la Web App Firebase corretta.
4. **Auth:** verificare direttamente Authorized domains, provider Google, eventuali account/grant e restrizioni senza aprire le registrazioni.
5. **Sicurezza:** audit live delle Firestore Rules legacy prima di qualsiasi integrazione cloud Piante; protezione against cross-user, account deletion, App Check se applicabile.
6. **Deployment:** attivare pipeline Firebase Hosting solo dopo controlli WIF/OIDC e autorizzazione; nessun deploy automatico configurato.
7. **Revisione periodica:** ricontrollare quote Spark, API key referrer, domini OAuth/Auth, Rules/indici/IAM, branch protection e integrazioni non richieste; registrare data e fonte.

## Modello per nuovi servizi o cambi

Per ogni servizio futuro aggiungere nella mappa e nella cronologia:
- **Fornitore / servizio** e scopo dell'integrazione.
- **Attivazione / iscrizione:** data nota oppure «non verificata»; account/ruolo **senza identificativi personali**.
- **Ambiente e piano:** sviluppo, test o produzione; gratuito/Spark, quote, rischi di addebito.
- **Dati e sicurezza:** dati trattati, consenso, permessi, API/deploy, dipendenze legacy.
- **Configurazione essenziale:** domini, callback e nomi delle variabili (mai secret).
- **Evidenze:** screenshot vs verifica provider vs codice/CI, con data.
- **Stato operativo e blocchi**; procedura di revoca, dismissione e rollback.

Non pubblicare screenshot delle console contenenti identificativi di credenziali, email o dettagli di fatturazione.
