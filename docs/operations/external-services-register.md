# Registro dei servizi esterni — Piante

> Avviato: **2026-10-08**. Repository **pubblico**; niente credenziali, client secret, email private o screenshot di console committati.
>
> Fonti: codice GitHub, verifiche GitHub effettive e screenshot/dichiarazioni del product owner. Questo documento **non** prova che la configurazione Firebase/Google Cloud sia stata interrogata direttamente tramite API.

## Scopo e legenda

Registro permanente delle iscrizioni e integrazioni esterne della PWA Piante, ispirato al registro di TheLogBook e aggiornato quando un provider cambia.

- `ACTIVE`: codice/CI effettivamente operativi nel perimetro indicato, non implica deploy del frontend.
- `CONFIGURED-NOT-ACTIVE`: predisposto ma non attivato o non collaudato.
- `LEGACY`: dipendenza esistente del vecchio client Pianta, da mantenere fino alla migrazione verificata.
- `RETIREMENT-PLANNED`: dismissione **decisa ma non ancora eseguita**; non equivale a cancellazione autorizzata.
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
| Firebase Project `pianta-db` / Google Cloud, display name **Piante** | **ACTIVE** per dati Pianta; **CONFIGURED-NOT-ACTIVE** per cloud Piante | progetto condiviso *fino al cutover*; Piante diventa unico client previsto dopo migrazione | Firebase Spark riferito; **no Blaze senza consenso** | `USER-SCREENSHOT` 2026-10-21 per database; niente API provider/IAM interrogate |
| Firebase Hosting site `piante`, `https://piante.web.app` | **CONFIGURED-NOT-ACTIVE / VERIFY-LIVE** | destinazione frontend PWA e OAuth helper | Hosting statico, target Spark | `USER-REPORTED` per site; deploy e handler HTTP non verificati |
| Firebase Authentication — Email/Password + Google | **ACTIVE** per Pianta/test (provider abilitati riferiti); **CONFIGURED-NOT-ACTIVE / VERIFY-LIVE** Piante | identità dell'account test e futuri accessi; non cancellare Auth per ritirare il vecchio client | niente iscrizioni indiscriminate, pianificare deletion lifecycle | `USER-REPORTED` 2026-10-21: Email/Password e Google abilitati, un solo account di test; numero/provider non verificati via API |
| Google Auth Platform — Web OAuth client Firebase | **CONFIGURED-NOT-ACTIVE / VERIFY-LIVE** | popup Google, origini consentite e callback OAuth | un client Google esistente condiviso: **non eliminare redirect legacy** | `USER-SCREENSHOT` + `USER-REPORTED` 2026-10-08; origine Piante aggiunta secondo il product owner, verifica diretta ancora aperta |
| Google Cloud — Browser API key Firebase | **LEGACY + VERIFY-LIVE** | API Firebase Web; referrer e API allowlist | chiave Web non equivale a credenziale amministrativa | `USER-SCREENSHOT`: restrizioni HTTP referrer e API visibili, valori non aperti |
| Cloud Firestore `(default)` — `europe-west12` | **ACTIVE** per dati Pianta, **CONFIGURED-NOT-ACTIVE** per Piante | conservare `users/{uid}` fino a backup e migrazione; futura replica Piante su namespace distinto | quote Spark e dati privati, foto e metadati | `USER-SCREENSHOT` 2026-10-21: root `users` visibile, sottocollezioni `plants` e `images` nel documento selezionato; inventario completo non provato |
| Firebase Security Rules / indici live | **VERIFY-LIVE** | enforcement reale del database condiviso | **non distribuire** le Rules `firestore.m2-test.rules` | nessun read-back diretto del provider |
| Google Cloud IAM / service account Firebase | **VERIFY-LIVE** | gestione privilegi provider, futuro WIF senza chiavi JSON | principio di minimo privilegio | `USER-SCREENSHOT`: service account visibile; nessun ruolo/IAM verificato |
| Firebase App Check / Fraud Defense | **VERIFY-LIVE** | eventuale protezione abusi futura | nessun enforcement affermato | configurazione non verificata |
| Firebase Storage | **NOT-INTEGRATED** nella nuova Piante | eventuali immagini in milestone futura | esaminare quote e privacy prima di usarlo | nessun accesso runtime nuovo |
| Google Analytics / GA4 | **NOT-INTEGRATED** (escluso) | nessun tracking richiesto | non abilitare senza decisione esplicita | vincolo di prodotto; nessun codice di tracking Piante |
| Vercel / `https://pianta-gnf.vercel.app/` | **RETIREMENT-PLANNED** per Pianta; **NOT-INTEGRATED** in Piante | dismettere il vecchio frontend dopo cutover verificato, mai usarlo per Piante | conservare fino a backup, verifica client offline e piano rollback | `GITHUB-OBSERVED`: README e `vercel.json` legacy; presenza/live del progetto da verificare sul provider |
| Firebase Cloud Functions / servizi Blaze | **NOT-INTEGRATED** | backend a pagamento non autorizzato | piano Spark obbligatorio | vincolo di prodotto; nessuna nuova integrazione |
| Google Search Console / Sentry / Snyk | **NOT-INTEGRATED** | possibili sistemi futuri SEO, error tracking e security | opt-in, privacy/costi da valutare | nessuna registrazione o stato provider rivendicati |

## Decisione di dismissione e nuovi riscontri (2026-10-21)

**Decisione di prodotto:** il product owner ha richiesto la **dismissione definitiva della vecchia Pianta** e la continuazione dello sviluppo di Piante. Stato **`RETIREMENT-PLANNED`**, NON `RETIRED`. **Autorizzazione:** il product owner consente modifiche tecniche al database attualmente di test, subordinate ai gate di inventario, protezione dati e rollback; non è autorizzazione indiscriminata alla cancellazione irreversibile. Sono autorizzate pianificazione e implementazioni non distruttive; la decisione non prova backup, migrazione, rimozione di dati o disattivazione del frontend già avvenute. Procedura vincolante: [piano di ritiro e migrazione](pianta-retirement-and-data-migration.md).

**Informazioni riportate dall'utente dalla Console Firebase** (non lettura API autonoma):
- **Firestore:** screenshot della console Piante con database `(default)`, località `europe-west12`, collezione principale `users` e sottocollezioni `plants`/`images` nel documento selezionato; sono visibili campi del documento root, ma non si pubblicano UID, contenuti botanici privati o foto. Lo screenshot **non** dimostra che `users` sia l'unica collection o che l'intero database abbia un unico account.
- **Rules:** il product owner ha copiato il testo che vede nella Console: è strutturalmente/letteralmente coerente con `tests/fixtures/pianta-legacy-user-reported.rules`, blob `4953d4ca66305e4db39b38acbc8d738650b536e9`. Queste Rules proteggono `users/{uid}` con ownership ma non aprono `piante_users` e `piante_access`. **Versione/etichetta del release live non ottenuta tramite API**; fixture composito e Rules M2 restano solo Emulator.
- **Authentication:** il product owner riferisce un solo **account test** e metodi **Email/Password + Google** abilitati. Non è una conta provider effettuata dall'assistente; verificare account effettivi, eventuali provider collegati e conseguenze sulla cancellazione prima di modificare Auth.
- **Piano:** Spark gratuito è il vincolo di prodotto. Nessun consenso a Blaze o altri prodotti a pagamento. **App Check:** è presente nello screenshot un banner per configurarlo, non prova che sia abilitato né disabilitato.
- **Dati:** il client Pianta usa `users/{uid}` con piante/log, spese, wishlist e immagini (da repository). L'export legacy `schemaVersion:3` è disponibile nel codice; bisogna collaudarne il download e la completezza. Non trattare un backup UI che filtra documenti non conformi come prova assoluta di un export Firestore esaustivo.

**Confini operativi immediati:** mantenere Auth, tutte le raccolte e Rules legacy invariati; niente purge o nuova pubblicazione Rules/Hosting finché non esistono backup privati verificati, inventario provider, import idempotente e test di rollback. Dopo cutover Piante si valuteranno separatamente cleanup, credenziali OAuth e Vercel legacy.

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

## M5b-2 — Firestore laboratorio (2026-10-11)

- **Provider:** Firebase Firestore; nessun nuovo fornitore né costo autorizzato. Nuovo namespace soltanto nelle Rules di laboratorio `piante_users/{uid}/checkpoint_observations/{replicaId}`.
- **Stato:** `CONFIGURED-NOT-ACTIVE / VERIFY-LIVE` per Piante reale. L'adapter è test-only, non connesso all'app, né distribuito. Il fixture composito Emulator conserva il file legacy pinned di Pianta. L'osservazione cloud non è autorità causale.
- **Privacy:** attestazione privata con digest SHA-256, contatori e identificativo replica, senza dati botanici in chiaro; resta comunque un metadata privato. Ownership e grant in Rules Emulator; quota letture/scritture Spark da valutare prima dell'attivazione.
- **Evidenza:** `GITHUB-OBSERVED` per codice/Rules, `NOT-VERIFIED` per Firestore live, IAM, costi effettivi e runtime. **Nessuna modifica esterna e nessun deploy.** Rollback: rimozione del codice/fixture tramite PR, nessuna migrazione live necessaria.

## Eventi / decisioni tracciate



| Data | Provider | Evento | Evidenza | Stato / seguito |
| --- | --- | --- | --- | --- |
| 2026-10-21 | Prodotto / Pianta → Piante | Product owner decide di ritirare Pianta; piano G0–G4 documentato, nessun dato/account/sito eliminato | `USER-REPORTED` + `GITHUB-OBSERVED` per il piano | `RETIREMENT-PLANNED`; backup completo verificato e cutover ancora da eseguire |
| 2026-10-21 | Firebase Firestore console | Screenshot mostra database `(default)` in `europe-west12`, root `users` e sottocollezioni `plants`/`images`; le Rules incollate corrispondono al fixture legacy | `USER-SCREENSHOT` + `USER-REPORTED`, **NON** `PROVIDER-OBSERVED` | Non attestare inventario totale, release Rules o assenza di altre collezioni; audit ancora aperto |
| 2026-10-21 | Firebase Authentication | Product owner indica Email/Password e Google attivi, un solo account test | `USER-REPORTED` | Verificare provider/utenti dal sistema competente; non eliminare Auth prima di migrazione |
| 2026-10-09 | Firebase Firestore Rules condivise con Pianta | Il product owner ha fornito il testo delle Rules che indica come attuali in `pianta-db`; lo schema `users/{uid}` corrisponde al file `gernotfound/pianta@acc510e2/firestore.rules`. Avviata la prova di convivenza M4a in Emulator senza deploy | `USER-REPORTED` per configurazione corrente; `GITHUB-OBSERVED` per snapshot del repository legacy; `NOT-VERIFIED` dal provider | **VERIFY-LIVE**: leggere Rules/versione direttamente su Firebase prima di qualunque deploy; il test composito non prova lo stato pubblicato |
| 2026-10-09 | GitHub / Firebase Auth SDK (test-only) | M3f: l'accesso test legge continuamente il grant Firestore da server, invalida immediatamente la vista al rilevamento di revoca/cache/offline e previene il riuso di un epoch precedente. I test Emulator verificano revoche e tombstone | `GITHUB-OBSERVED` (implementazione e CI sullo SHA candidato) | Nessuna modifica provider, nessun login attivo in build pubblica; Auth live/Rules/OAuth `VERIFY-LIVE` |
| 2026-10-09 | GitHub / Firebase Hosting | M3e: aggiunto un preflight statico di release, test negativi e un required gate aggregato che impedisce la produzione della build con `VITE_AUTH_TEST_MODE` attivo o configurazioni Firebase non-Hosting | `GITHUB-OBSERVED` (configurazione nel repository; CI da verificare) | **Nessun cambiamento provider** e nessun deploy; Firebase live, OAuth, IAM, Rules/Hosting restano `VERIFY-LIVE` |
| 2026-10-08 | GitHub | M2a integrata su `main` (squash SHA `8dc84e52`): Auth test-only e suite Firestore Emulator; post-merge CI verde | `GITHUB-OBSERVED` | nessun deploy Firebase |
| 2026-10-08 | Firebase Auth | Screenshot del product owner conferma `piante.web.app` tra gli Authorized domains insieme ai domini legacy | `USER-SCREENSHOT` | aggiunta visibile; verifica diretta provider ancora aperta |
| 2026-10-08 | Google OAuth | Screenshot conferma il redirect `https://piante.web.app/__/auth/handler` tra quelli autorizzati | `USER-SCREENSHOT` | redirect visibile; OAuth runtime non collaudato |
| 2026-10-08 | Google OAuth | Screenshot antecedente alla modifica: l'origine `https://piante.web.app` non era presente | `USER-SCREENSHOT` | situazione storica, poi aggiornata dall'utente |
| 2026-10-08 | Google OAuth | Il product owner riferisce di aver aggiunto e salvato `https://piante.web.app` nelle origini JavaScript autorizzate del client OAuth Web esistente | `USER-REPORTED` | aggiunta dichiarata completata; conferma diretta del provider, origini legacy e prova login runtime ancora aperte |
| 2026-10-08 | Google Cloud | Browser API key con restrizioni ai referrer HTTP e lista API | `USER-SCREENSHOT` | valori referrer da ispezionare; nessuna modifica eseguita |
| 2026-10-08 | Documentazione | Introdotto registro pubblico e regola per future iscrizioni/integrazioni | `GITHUB-OBSERVED` dopo merge e CI | aggiornare a ogni cambio esterno |

## Verifiche aperte, priorità

1. **Dismissione Pianta / salvaguardia dati:** inventario provider Auth + Firestore, **backup privato completo e verificato** (UI Pianta v3 come copia aggiuntiva), mappa dei client ancora attivi e piano rollback; seguire [G0–G4](pianta-retirement-and-data-migration.md). Nessuna eliminazione immediata.
2. **OAuth:** aggiunta di `https://piante.web.app` alle *Origini JavaScript autorizzate* **dichiarata completata dal product owner il 2026-10-08**. Verificare direttamente sul provider il salvataggio e la permanenza delle origini/callback legacy; quindi collaudare il login sulla nuova PWA quando sarà realmente distribuita.
3. **API key:** controllare la Browser key, includere il referrer `https://piante.web.app/*` **solo se necessario**, senza interrompere i referrer legacy.
4. **Hosting:** verificare che l'URL del sito e `/__/auth/handler` rispondano davvero, e associare la Web App Firebase corretta.
5. **Auth:** verificare direttamente Authorized domains, provider Google, eventuali account/grant e restrizioni senza aprire le registrazioni.
6. **Sicurezza:** audit live delle Firestore Rules legacy prima di qualsiasi integrazione cloud Piante; protezione against cross-user, account deletion, App Check se applicabile.
7. **Deployment:** attivare pipeline Firebase Hosting solo dopo controlli WIF/OIDC e autorizzazione; nessun deploy automatico configurato.
8. **Revisione periodica:** ricontrollare quote Spark, API key referrer, domini OAuth/Auth, Rules/indici/IAM, branch protection e integrazioni non richieste; registrare data e fonte.

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
