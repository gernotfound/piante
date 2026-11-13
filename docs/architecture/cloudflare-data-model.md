# Piantee — modello dati Cloudflare D1 (candidato CF-01)

**Stato: PROPOSTA IMPLEMENTATA IN BRANCH, NON IN PRODUZIONE.** Questa pagina descrive il nuovo modello SQL contenuto in `cloudflare/migrations/0001_initial.sql`. La fonte di verità per l'implementazione candidata è il file SQL e i test `tests/contracts/cloudflare-schema.test.js`; i provider determinano ciò che è stato realmente distribuito. Riferimento operativo: [EPIC #32](https://github.com/gernotfound/piante/issues/32), [CF-01 #34](https://github.com/gernotfound/piante/issues/34), [CF-02 #35](https://github.com/gernotfound/piante/issues/35).

## Confini del Fresh Start

- Il **nuovo** database D1 partirà **vuoto**, con specie, cultivar, lotti, piante, prenotazioni di codici, diari e catalogo a zero righe. Il file è solo una *migration v1* per un nuovo database, senza INSERT di dati esistenti o utenti.
- **Nessun accesso, export, import, riconciliazione, conversione o compatibilità** con Firestore, account Firebase o codici già usati in Firebase. Solo funzioni di prodotto possono essere ripensate per la nuova applicazione.
- Il sito e i dati Firebase restano intatti. Non sono stati creati Worker, D1, credenziali, dominio, DNS o deploy Cloudflare per questa modifica. Il proprietario ha confermato il nome futuro `piantee` e l'hostname gratuito `https://piantee.califano-ger.workers.dev` (documentato nella PR draft #44). L'URL non risulta ancora creato o pubblicato e la scelta non autorizza un deploy.
- Il nuovo D1 dovrà essere creato con `jurisdiction=eu` **prima** di eseguire la migration; la giurisdizione non può essere aggiunta successivamente. Non è garantita da sola la localizzazione UE di Worker, Access, CDN o log.

## Modello relazionale e requisiti

| Struttura | Responsabilità | Accesso previsto |
| --- | --- | --- |
| `taxa` | Profili botanici condivisi per specie, ibridi o identificazioni ancora incerte; nome comune manuale, nome scientifico e dati agronomici facoltativi | Owner; pubblico **solo se raggiunto da una pianta pubblicata** |
| `taxon_aliases` | Sinonimi e nomi alternativi; lo stesso alias può appartenere a specie diverse | Owner; ricerca pubblica solo su profili con pubblicazioni |
| `cultivars` | Cultivar collegate a un taxon, con propri dati del frutto/rusticità/impollinazione | Owner; pubblico solo tramite catalogo autorizzato |
| `taxon_harvest_months`, `cultivar_harvest_months` | Mesi 1–12 espliciti, senza inferire periodi di raccolta | Tramite profili autorizzati |
| `seed_lots` | Lotti, fonte e provenienza, cultivar del frutto sorgente **solo descrittiva**, non identificazione genetica | Solo owner |
| `specimens` | Piante individuali, legami botanici, stato, posizione, immagine personale, note, versione di modifica | Solo owner |
| `specimen_code_reservations` | Registro permanente dei nuovi codici di sei lettere maiuscole/cifre | Solo owner |
| `journal_entries` | Diario privato append-only di osservazioni manuali e eventi automatici | Solo owner |
| `public_listings` | Approvazione esplicita della pubblicazione, descrizione sintetica/immagine scelti per il pubblico | Scrittura owner; lettura pubblica **solo attraverso la vista** |
| `public_catalog` | Vista SQL con sola allowlist di campi pubblicabili, senza note, provenienza, lotto, posizione né diario | Fonte esclusiva per API anonime |

I nomi scientifici, la rusticità, l'autofertilità e gli altri attributi non verificati rimangono **NULL**, non dedotti da un nome commerciale né trasformati in valori fittizi. Una cultivar di provenienza del seme non fa diventare il nuovo esemplare quella cultivar. La scelta di `taxa.kind='unverified'` consente di inserire un nome comune senza attribuirgli una classificazione scientifica inventata.

## Integrità e concorrenza

- `FOREIGN KEY`, `UNIQUE`, `CHECK` e indici proteggono integrità e ricerca. Collegamenti specie↔cultivar e specie↔lotto sono verificati anche tramite chiavi esterne **composte**.
- La registrazione di una nuova pianta richiede che esistano in modo atomico una prenotazione codice e l'esemplare corrispondente; una FK composta impedisce che la stessa prenotazione venga associata a un'identità diversa. Il registro codice non può essere aggiornato o cancellato. Un trigger di inserimento impedisce anche la collisione tramite `INSERT OR REPLACE`, che potrebbe altrimenti aggirare un semplice trigger `BEFORE DELETE` con `recursive_triggers` disattivati.
- **Non considerare** questi trigger una difesa contro `DROP TABLE`, ripristini di vecchi snapshot o privilegi amministrativi sul database. Prima di riaprire il servizio dopo un restore va riconciliata la storia delle prenotazioni successive al punto di ripristino; la politica operativa è parte di [CF-08 #41](https://github.com/gernotfound/piante/issues/41).
- I diari sono immutabili anche nelle query dirette (incluse collisioni con `INSERT OR REPLACE`); una pianta con qualsiasi evento di diario non può essere eliminata. È una **politica conservativa temporanea**, da rivedere solo dopo una decisione di prodotto esplicita sulle cancellazioni, senza distruggere osservazioni.
- `version` è disponibile sui profili, lotti e piante per aggiornamenti ottimistici. **Un `UPDATE ... WHERE version=?` che modifica zero righe NON fallisce automaticamente**: la futura API Workers deve trattarlo come conflitto, interrompendo tutte le scritture correlate (pubblicazione, codice, profilo, diario) e distinguendo retry dopo esiti incerti. I test attuali provano la segnalazione di 0 righe, non ancora l'atomicità di un'API D1 end-to-end.
- La vista `public_catalog` riferisce i profili botanici via JOIN: una modifica condivisa ai dati botanici pubblicabili si riflette sulle pubblicazioni senza replicare tutti i profili. Eliminare `public_listings` toglie immediatamente la riga dalla vista; dopo il rilascio servirà invalidazione della cache HTTP pubblica.
- Mesi, ordine e ricerche iniziali usano tabelle e indici normali. **Non è previsto FTS5 nella v1**: la sua esportazione D1 richiede un dump per SQLite CLI che non si può reimportare direttamente in D1, quindi l'eventuale adozione futura richiederà un collaudo di backup/restore.

## API di lettura collegata\n\nLa [API Workers candidata](cloudflare-api.md) legge esclusivamente la vista `public_catalog` tramite query parametrizzate e nessuna operazione di amministrazione. La sua PR CF-02 dipende dallo schema CF-01; fino a validazione nativa su D1/Workers si tratta solo di contratto testato in SQLite sintetico.\n\n## Test, verifiche non eseguite, release

La suite `tests/contracts/cloudflare-schema.test.js` esegue la migration contro **SQLite locale in memoria** mediante `node:sqlite`: database inizialmente vuoto, FK, valori sconosciuti, alias ambigui, codici riservati e collisioni `REPLACE`, diario append-only, confini pubblico/privato, ritiro dal catalogo, rollback in transazione, CAS e indici di ricerca.

**Questa non è una verifica D1 Cloudflare**: rimangono necessari test su emulatore Cloudflare e/o DB D1 di test isolato con la CLI effettivamente adottata (`cf` salvo nuove evidenze), `EXPLAIN QUERY PLAN` su un volume realistico, test dei binding API e prove di fallimento/quota. Nessuna migration deve essere applicata a un database remoto senza controllo del target e mandato appropriato; l'applicazione in produzione richiede gate e autorizzazione del rilascio.

### Documentazione ufficiale

- [D1: foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- [D1: query e indici](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- [D1: migrazioni](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1: esportazione FTS5 (12/11/2026)](https://developers.cloudflare.com/changelog/post/2026-11-12-d1-export-virtual-tables/)
- [D1: giurisdizione EU](https://developers.cloudflare.com/d1/configuration/data-location/)
