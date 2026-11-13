# Piantee → Cloudflare: contesto operativo e indirizzo gratuito

**Checkpoint:** 2026-11-13. **Stato:** pianificazione/guida alla creazione; nessun Worker Piantee o D1 di produzione verificato. Questo documento registra evidenze datate, non sostituisce un read-back della console/provider.

## Decisioni di prodotto vigenti

- **Fresh Start:** la nuova app Cloudflare nasce con D1 **nuovo e vuoto** e un nuovo account/identità amministrativa. Non importare, replicare, convertire né riutilizzare account, sessioni, dati botanici o record dell'attuale Firebase. Non creare adattamenti per schede legacy.
- **Hosting target:** Cloudflare Workers con Static Assets e API; D1 SQL da creare in giurisdizione EU quando autorizzato. Architettura e criteri nelle issue [EPIC #32](https://github.com/gernotfound/piante/issues/32), [CF-02 #35](https://github.com/gernotfound/piante/issues/35) e fasi collegate.
- **Tipo di indirizzo richiesto, nome NON ancora deciso:** il proprietario desidera un sottodominio **gratuito Cloudflare**, senza acquistare un dominio. Vuole però vedere e modificare personalmente il nome nella schermata di creazione, **prima di confermarlo**. `https://piantee.califano-ger.workers.dev` è soltanto un esempio proposto dall'assistente e **non approvato dall'owner**: non usarlo come decisione, nome riservato o vincolo di configurazione. La parte iniziale dipende dal nome Worker disponibile; il suffisso account `califano-ger.workers.dev` è condiviso con TheLogBook e non va cambiato senza valutare gli effetti su quel progetto. Un hostname `workers.dev` non è un dominio registrato con gestione DNS autonoma; le protezioni disponibili e le regole WAF sul dominio personalizzato non sono identiche.
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
- Prossimo passo: lasciare al proprietario la scelta libera del nome del Worker nella UI, verificare anteprima e disponibilità senza finalizzare; mantenere PR draft e gate CF-02/CF-09 pendenti.

## Prossimi passi e gate

1. Dalla pagina Workers & Pages premere **Create application**. Esaminare la schermata prima di confermare opzioni o distribuire: distinguere Workers da Pages; scegliere il nome del Worker compatibile con l'architettura e l'eventuale progetto già creato da un altro intervento.
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
