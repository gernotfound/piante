# Piantee — API Workers candidata (CF-02 su schema CF-01)

**Stato 13/11/2026:** solo codice su branch di sviluppo, nessun deploy Cloudflare o API raggiungibile sul nuovo hostname. La produzione attuale resta Firebase. Riferimenti: [EPIC #32](https://github.com/gernotfound/piante/issues/32), [CF-01 #34](https://github.com/gernotfound/piante/issues/34), [CF-02 #35](https://github.com/gernotfound/piante/issues/35), [CF-03 #36](https://github.com/gernotfound/piante/issues/36), [CF-04 #37](https://github.com/gernotfound/piante/issues/37).

## Contratto implementato

| Endpoint | Comportamento |
| --- | --- |
| `GET /api/v1/catalog` | Solo righe della vista SQL `public_catalog`; ritorna `{items: [...], nextCursor: string|null}`, ordinate per `published_at DESC, id DESC` |
| `GET /api/v1/catalog/:id` | Solo record pubblicato, altrimenti HTTP 404; ID ASCII `A-Za-z0-9_-`, max 96 |
| `/api/v1/admin` e `/api/v1/admin/*` | HTTP 403 **sempre**; nessun endpoint amministrativo è ancora attivo |
| Altre route `/api/*` | HTTP 404, mai una pagina SPA/asset restituito con HTTP 200 |
| Metodi diversi da `GET` sulle route catalogo | HTTP 405 e `Allow: GET` |

Il parametro `limit` è un intero da 1 a 40 (default 20). Il `cursor` è codificato Base64URL, non firmato né usato come credenziale: autorizza **solo** a proseguire una lista pubblica, senza informazioni segrete. La ricerca e i filtri `q`, `category` ecc. **non sono implementati** in questo incremento; i parametri non riconosciuti o ripetuti producono 400, non risultati ingannevoli.

## Privacy, consistenza e fallimenti

- I dati sono letti **solo** da `public_catalog` tramite `DB.prepare(...).bind(...)`; le colonne selezionate costituiscono una prima allowlist e **ogni risposta JSON viene ricostruita campo per campo** tramite una seconda allowlist. Un campo privato restituito inaspettatamente da un adattatore D1 non viene inviato al client. Il client non riceve note interne, provenienza, diari, lotti, posizione privata, identificativi di account o query SQL arbitrarie.
- `Cache-Control: no-store, max-age=0` evita che una scheda ritirata dal catalogo continui a essere servita dalla cache applicativa; per un caching più aggressivo occorrono invalidazione e test specifici. Non sono presenti intestazioni CORS permissive.
- Il DB assente, una query fallita o un risultato fuori contratto producono `503 service_unavailable`, **non** un catalogo artificiosamente vuoto. Dettagli SQL e dati interni non compaiono nella risposta.
- La paginazione keyset è deterministica su dataset invariato; inserimenti o ritiri durante la navigazione possono variare le pagine. Il futuro backend di pubblicazione dovrà scrivere `published_at` in formato UTC ISO uniforme (es. `new Date().toISOString()`) per conservare l'ordinamento testuale atteso.
- **Nessuna scrittura è possibile:** perfino header Cloudflare Access falsificati e cookie non sbloccano l'admin. Non interpretare questa negazione iniziale come autenticazione implementata: CF-03 dovrà validare JWT/identità owner e affrontare logout, recupero, CSRF e URL alternativi.
- `cloudflare/worker/index.js` è codice server. La directory non viene inclusa nel build legacy `dist/`; la [PR draft #43](https://github.com/gernotfound/piante/pull/43) rafforza ulteriormente l'allowlist dei moduli pubblici.
- Quando verrà preparata la configurazione reale Static Assets, usare instradamento **Worker-first selettivo per `/api/*`**, mantenendo gli asset statici fuori dal consumo Worker quando possibile. Non è stato aggiunto un file `wrangler.toml/jsonc` né un binding remoto: la CLI del progetto va scelta secondo la configurazione effettiva; per un nuovo progetto Cloudflare la preferenza attuale è `cf`.

## Frontend pubblico indipendente da Firebase (candidato CF-04)

Il nuovo frontend è in `cloudflare/site/index.html`, `cloudflare/site/styles.css` e `cloudflare/site/app.js`. Non importa Firebase SDK, non implementa login e non visualizza dati di prova: richiede solo l'API `GET /api/v1/catalog` e `GET /api/v1/catalog/:id`. Mostra un catalogo davvero vuoto quando la risposta è vuota, un errore con comando **Riprova** quando API/D1 falliscono, pagine successive senza duplicati e dettagli in dialog accessibile. Le foto compaiono solo tramite URL HTTPS presenti nei dati; in assenza o errore viene mostrata una dicitura testuale, senza immagini finte. Testo botanico nel DOM tramite `textContent`, mai `innerHTML`. La navigazione amministrativa è volutamente assente finché CF-03 non è realizzato.

`scripts/build-cloudflare-site.mjs` crea **esclusivamente** `cloudflare/dist/` (quattro file: `index.html`, `app.js`, `styles.css`, `favicon.svg` originale). L'output è ignorato da Git. Il precedente comando `npm run build` conserva il suo significato Firebase: il comando aggiunto è `npm run build:cloudflare`. Il build non include `cloudflare/worker/`, migrazioni SQL, file `src/` o documenti interni. Anche test e script operativi restano esclusi.

L'attuale sito HTML Firebase **non può essere copiato** direttamente nel nuovo hosting: importerebbe autenticazione e riferimenti a dati vecchi. Questa nuova pagina è volutamente minimale e Mobile First, in attesa di ricerca/filtri e UI gestionale. L'hostname `piantee.califano-ger.workers.dev` è confermato, **non ancora creato o live**.

### Test del frontend (candidato)

- `tests/contracts/cloudflare-site.test.js`: allowlist del build, nessun file segreto, risorse referenziate, regressione contro asset extra, layout/marcatura minima senza import Firebase.
- `tests/e2e/cloudflare-site.test.js`: browser Chromium con server e API sintetiche **solo locali**, larghezze 320/360/390/430/768/1024/1440 CSS px, lista, dettagli, paginazione, errore/recupero e iniezione di markup. Il file è incluso nello script `npm run test:browser` insieme agli E2E Firebase.
- Questi controlli non provano URL cloudflare, Access, D1 reale o SEO/SSR. La CLI `cf` è ancora in beta e la configurazione con binding D1 definitivo verrà validata solo dopo il provisioning autorizzato di un D1 di Piantee, separato da TheLogBook. **Nessun binding D1 remoto è stato inventato.**

## Verifiche e limiti

La suite `tests/contracts/cloudflare-public-api.test.js` usa il vero motore SQLite in memoria con soli dati sintetici, caricando `cloudflare/migrations/0001_initial.sql` dalla PR CF-01; un adattatore minimo simula `prepare/bind/all/first` di D1. Copre catalogo vuoto, dati privati, pubblicazione/ritiro, paginazione con timestamp uguali, limiti e cursor malevoli, accessi amministrativi negati, metodi HTTP, risposte 503, fallback SPA e parametrizzazione SQL.

**Questo test non equivale al runtime Workers/D1**: restano da collaudare la migration in D1 locale, il binding reale, la giurisdizione EU, le quote Free, i dati sintetici nell'ambiente isolato, la futura autenticazione e il browser sul nuovo frontend. Nessun Worker, D1, sito o account Cloudflare è stato creato da questo incremento.

Fonti tecniche: [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [D1 return objects](https://developers.cloudflare.com/d1/worker-api/return-object/), [Workers Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
