# Piantee → Cloudflare: contesto operativo e indirizzo gratuito

**Checkpoint:** 2026-11-13. **Stato:** pianificazione/guida alla creazione; nessun Worker Piantee o D1 di produzione verificato. Questo documento registra evidenze datate, non sostituisce un read-back della console/provider.

## Decisioni di prodotto vigenti

- **Fresh Start:** la nuova app Cloudflare nasce con D1 **nuovo e vuoto** e un nuovo account/identità amministrativa. Non importare, replicare, convertire né riutilizzare account, sessioni, dati botanici o record dell'attuale Firebase. Non creare adattamenti per schede legacy.
- **Hosting target:** Cloudflare Workers con Static Assets e API; D1 SQL da creare in giurisdizione EU quando autorizzato. Architettura e criteri nelle issue [EPIC #32](https://github.com/gernotfound/piante/issues/32), [CF-02 #35](https://github.com/gernotfound/piante/issues/35) e fasi collegate.
- **Indirizzo scelto dall'owner il 13/11/2026:** `https://piantee.califano-ger.workers.dev` per il nuovo Piantee su Cloudflare, senza acquistare un dominio. Il proprietario ha esplicitamente confermato il nome **dopo** aver visto il campo `Worker name` della console. Questa è una **decisione di prodotto** e **non** equivale a creazione/prenotazione del Worker o al GO per il sito in produzione. Il suffisso `califano-ger.workers.dev` è condiviso con TheLogBook e non va modificato. Un hostname `workers.dev` non è un dominio registrato con gestione DNS autonoma; le protezioni disponibili e le regole WAF sul dominio personalizzato non sono identiche.
- **Vecchia produzione separata:** `https://piantee.web.app` resta gestita da Firebase; nessun DNS, dato, account o servizio legacy viene modificato automaticamente. La chiusura del vecchio stack è una decisione distinta e potenzialmente distruttiva.

## Evidenze osservate sulla console Cloudflare

| Data e provenienza | Evidenza | Limite |
|---|---|---|
| 2026-11-13, **USER-REPORTED screenshot** Workers & Pages | Sottodominio account: `califano-ger.workers.dev` | Screenshot, non read-back API; valore modificabile dall'account |
| 2026-11-13, **USER-REPORTED screenshot** | Una sola applicazione elencata: `thelogbook-frontend`, URL `thelogbook-frontend.califano-ger.workers.dev` | Una pagina elenco non prova assenza di altre risorse su account differenti, né integrazioni backend |
| 2026-11-13, **USER-REPORTED screenshot** | Il pannello mostra quota Workers giornaliera di 100.000 richieste nel riepilogo Free | Quota riferita alla schermata, non impegno futuro né verifica del consumo effettivo; considerare TheLogBook nello stesso account |
| 2026-11-13, **VERIFIED-REPO GitHub** | `main` all'atto della rilevazione: `1b0e910327a648286f071a0d1e73c3af2d48b8af`; codice corrente Firebase, nessun file Cloudflare Worker nella tree `main` osservata | Ricontrollare SHA prima di ogni modifica; la pianificazione nelle issue non equivale a implementazione |

Non riportare nei documenti pubblici email di account, segreti, token, identificativi personali o dati Firebase esistenti. Il sottodominio account e gli hostname dei Worker sono pubblici e necessari a documentare il routing.


## Schermata di scelta del nome — 2026-11-13 (USER-REPORTED screenshot; NO DEPLOY)

- Il proprietario ha aperto **Create application → Start with Hello World! → Deploy Hello World** nella console Workers. La schermata mostra il campo **Worker name** con l'anteprima `piantee.califano-ger.workers.dev` e una spunta di validazione; il proprietario **non ha confermato il nome**, quindi l'anteprima non è una decisione né una prova di provisioning o di prenotazione.
- Il campo consente di modificare il prefisso (nome del Worker). Il suffisso account `califano-ger.workers.dev` è condiviso con TheLogBook e non va cambiato nell'ambito di questa configurazione senza analizzare le conseguenze.
- Sono visibili l'opzione **Protect with Cloudflare Access** con selettore apparentemente disattivato e il pulsante **Deploy**. Non è stata mostrata alcuna azione su questi controlli; la posizione visiva del toggle non prova che la futura app sarà o resterà non protetta.
- Questo flusso genera un **Worker Hello World**, non il codice Piantee. Non cliccare Deploy per creare un segnaposto prima di aver scelto nome e strategia di rilascio/Access; nessun hostname Piantee è attestato come live, né sono stati creati D1 o altri servizi.
- **Decisione successiva verificata:** nome approvato `piantee`; non fare deploy del Worker Hello World come surrogato del frontend. Preparare Worker reale tramite il percorso CF-02 e verificare URL/runtime solo dopo un rilascio autorizzato; mantenere PR draft e gate CF-02/CF-09 pendenti.


## Conferma URL e verifica diretta Cloudflare — 2026-11-13

- **USER-APPROVED:** il proprietario ha confermato espressamente `piantee.califano-ger.workers.dev` e chiesto di procedere; il nome del Worker destinato a Piantee sarà `piantee`.
- **VERIFIED-CLOUDFLARE-API, sola lettura:** endpoint `GET /accounts/{account_id}/workers/subdomain` restituisce `califano-ger`; `GET /accounts/{account_id}/workers/scripts` restituisce un solo Worker `thelogbook-frontend`. Nessun Worker denominato `piantee` compare nell'elenco al momento della verifica. Non prova disponibilità riservata, funzionamento TLS o hostname pubblicato.
- **PENDING:** nessun codice Piantee è stato deployato su Cloudflare; non esistono prova di D1, autenticazione, security gate o URL pubblicamente raggiungibile. Il pulsante `Deploy` della procedura Hello World non serve per pubblicare il prodotto vero e non va usato come scorciatoia.
- **Azione successiva:** lavorare sulla vera app con il nome `piantee`, mantenendo integrità dei gate CF-02/CF-09 e senza toccare TheLogBook, Firebase o dati attuali. Conservare hostname come decisione; leggere il provider dopo un eventuale provisioning autorizzato.

## Aggiornamento GitHub — integrazione seriale del 13/11/2026

Questo è un checkpoint storico basato su GitHub, da ricontrollare prima di ogni nuovo merge. Le verifiche sul provider Cloudflare descritte sopra mantengono la propria data e non vengono aggiornate implicitamente dai commit.

- La [PR #43](https://github.com/gernotfound/piante/pull/43) è stata integrata con squash merge nel commit `4b07f7ce75232a68de300828d83f588dfe0440bd`. [CI main 43420318487](https://github.com/gernotfound/piante/actions/runs/43420318487) **success**. Nel successivo [workflow Firestore Rules 43420595130](https://github.com/gernotfound/piante/actions/runs/43420595130) e [workflow Hosting 43420632354](https://github.com/gernotfound/piante/actions/runs/43420632354), la verifica del perimetro ha dato esito positivo, ma **tutti gli step privilegiati di riconciliazione e deploy Firebase sono risultati skipped**: nessuna pubblicazione legacy provocata dal commit CF-02
- La [PR #45](https://github.com/gernotfound/piante/pull/45) è stata integrata con squash merge nel commit `40f52303e6413a6dbaf89eeceb88eb2476af5ce6`. Sono entrati soltanto modello D1, test SQLite sintetici e documentazione; **nessuna migration applicata a un D1 remoto**. [CI post-merge 43420972635](https://github.com/gernotfound/piante/actions/runs/43420972635) **COMPLETED/SUCCESS** sullo SHA `40f52303e6413a6dbaf89eeceb88eb2476af5ce6` verificato direttamente in GitHub
- La [PR #46](https://github.com/gernotfound/piante/pull/46) è **MERGED** su `main` allo SHA `f716f34a931de43f9460415bb137dbd12772a656`; la [CI post-merge 43422068337](https://github.com/gernotfound/piante/actions/runs/43422068337) è **COMPLETED/SUCCESS** sullo stesso SHA. Include API e frontend pubblici Cloudflare, ma nessun deploy/provider Cloudflare.
- **Non confondere repository e provider:** la disponibilità dei sorgenti sul main non crea né rende raggiungibile il Worker `piantee`; D1 EU, binding, autenticazione proprietario, configurazione `cf`, verifica native runtime e rilascio sono ancora fasi distinte. Nessun dato/account Firebase deve essere importato

## Checkpoint incrementale CF-04 — 13 novembre 2026 (VERIFIED-REPO CANDIDATE, NO DEPLOY)

- Stato di partenza verificato: `main` `f716f34a931de43f9460415bb137dbd12772a656`, con le PR #43/#45/#46 integrate. Il codice pubblico Workers/D1 è nel repository, ma il runtime Cloudflare non è attivo.
- Lettura diretta Cloudflare in sola lettura, account con sottodominio `califano-ger`: un Worker (`thelogbook-frontend`) e un D1 (`thelogbook-cf02-eu-isolated-20261113`) che appartengono a un altro progetto. **Zero Worker `piantee`, zero D1 Piantee**. Nessuna modifica a quelle risorse.
- Nuovo candidato nella [PR draft #47](https://github.com/gernotfound/piante/pull/47), branch `cf-04-catalog-search-filters-20261113`: query `q` e `category` parametrizzate contro la sola vista pubblica, prefisso `#` limitato ai codici, categorie deduplicate senza distinzione fra maiuscole ASCII, UI mobile form con stato applicato distinto dalla bozza, URL condivisibili, reset, gestione richieste obsolete e test SQL/browser. Il risultato CI va associato allo SHA di HEAD effettivo della PR, non a un commit precedente. Contratti: [API Workers](../architecture/cloudflare-api.md), [D1](../architecture/cloudflare-data-model.md). Stato di CI, PR e SHA vanno riletti da GitHub prima di dichiararli verificati; qui non si anticipa l'esito.
- Nessuna risorsa nuova, migration remota, credenziale, DNS o deploy in questa fase. Per test nativi Worker+D1 è necessaria CLI `cf` installata/configurata in ambiente dedicato: non considerare SQLite `node:sqlite` un test D1. Autenticazione owner CF-03 e cutover ancora pendenti.

## Prossimi passi e gate

1. **Nome confermato:** `piantee`. Dal percorso `Create application → Start with Hello World!`, non fare `Deploy` del codice dimostrativo; per il vero rilascio è necessario predisporre codice, build, bindings e gate della nuova app, poi creare/pubblicare il Worker finale.
2. **Nessun deploy placeholder automatico.** La creazione di un Worker di esempio può renderlo accessibile pubblicamente: verificare con l'owner il passaggio conclusivo e il collegamento al futuro build reale. Non cambiare il Worker di TheLogBook né il sottodominio comune `califano-ger.workers.dev`.
3. Per infrastruttura futura: preparare test isolati, confini client/server, D1 EU nuovo, auth admin nuova, quote/sicurezza/API, controlli exact-SHA e rollback. Vietato popolare D1 di produzione con dati demo o Firebase.
4. Dopo la creazione/deploy autorizzati: controllare l'hostname effettivo da provider e via HTTPS, accesso guest/admin e URL alternativi, eventuali bypass, TLS, errori/quote; registrare esito e SHA. Separare CI verde, deployment e prova runtime.
5. Prima di modificare `main` o pubblicare Piantee Cloudflare: rispettare i gate in [CF-09 #42](https://github.com/gernotfound/piante/issues/42). Il presente aggiornamento documentale non autorizza merge, deploy, eliminazioni, migrazioni o cambi di billing.

## Tracciamento e handoff

- [CF-EPIC #32](https://github.com/gernotfound/piante/issues/32): indice e vincoli globali, scelta Fresh Start.
- [CF-00 #33](https://github.com/gernotfound/piante/issues/33): fattibilità Free e budget/quota account condivisa.
- [CF-02 #35](https://github.com/gernotfound/piante/issues/35): Worker/Static Assets/API e D1 EU isolato, provisioning e CI.
- [CF-07 #40](https://github.com/gernotfound/piante/issues/40): API security, URL alternativi, WAF/Access/Turnstile, rate limiting.
- [CF-09 #42](https://github.com/gernotfound/piante/issues/42): hostname, E2E, GO di rilascio, cutover e dismissione separata.

Per nuove chat: partire da questo file, issue di fase e **nuova lettura di HEAD/PR** e console; il solo screenshot conferma **sottodominio account già esistente**, non **hostname Piantee creato**.


## Aggiornamento 13 novembre 2026 — PR #47 integrata; prossimo gate runtime locale

La [PR #47](https://github.com/gernotfound/piante/pull/47) è stata integrata mediante squash su `main` allo SHA `56568b99e74e7a8b49190e4547f50a7617389e7f`. La [CI post-merge 43430566780](https://github.com/gernotfound/piante/actions/runs/43430566780) ha superato cinque job. I workflow [Rules 43430887513](https://github.com/gernotfound/piante/actions/runs/43430887513) e [Hosting 43430928683](https://github.com/gernotfound/piante/actions/runs/43430928683) sono conclusi senza eseguire i passaggi privilegiati: Firebase non è stato pubblicato di nuovo.

Il prossimo incremento CF-02 introduce una verifica riproducibile del Worker e D1 tramite **Miniflare/workerd locale**. Non è un test del D1 remoto in giurisdizione UE, né del router Static Assets o del rilascio. Restano vincolanti Fresh Start, zero import Firebase, account/risorse TheLogBook intatti, divieto di provisioning e deploy senza autorizzazione.


## PR #48 integrata e nuova fase di packaging (13 novembre 2026)

La [PR #48](https://github.com/gernotfound/piante/pull/48) è stata integrata tramite squash in `main` `b18953bbf083c79592be0e1da3cb14730c3c006e`. La [CI post-merge 43433161078](https://github.com/gernotfound/piante/actions/runs/43433161078) ha concluso **SUCCESS 6/6**, incluso workerd/D1 locale. I workflow [Rules 43433443662](https://github.com/gernotfound/piante/actions/runs/43433443662) e [Hosting 43433483870](https://github.com/gernotfound/piante/actions/runs/43433483870) hanno completato senza eseguire alcuno step di deploy privilegiato. La produzione Firebase non è stata modificata dal merge.

Nuova fase CF-02: predisposizione del packaging statico attraverso `cf` e Vite, alimentato solo dalla allowlist dei file pubblici. È un candidato di build, non un Worker live; l'account TheLogBook e tutti i database esistenti devono rimanere intatti. Creazione D1 EU e pubblicazione necessitano un mandato distinto e verifiche live.

### Checkpoint candidato CF-02 packaging — 13 novembre 2026

La [PR draft #49](https://github.com/gernotfound/piante/pull/49) introduce `cf` + Vite v2 beta per generare localmente lo Static Assets bundle e il Worker API, mantenendo l'allowlist di quattro asset di origine, il frontend separato da `src/` Firebase e la destinazione `piantee`. La build passa per `npm run build:cloudflare:cf`, che genera il Build Output canonico senza credenziali e senza deploy. Il controllo locale conferma il modulo Worker e la struttura degli asset, **non** che il Worker sia online né che esista un D1. La [CI 43437294827](https://github.com/gernotfound/piante/actions/runs/43437294827) è stata SUCCESS 7/7 sul commit preliminare `4a64ff2635301ecd89df6d76839ad40f6a06eee9`; ogni successivo commit richiede un nuovo gate exact-SHA. Nessun provisioning autorizzato in questa fase.
