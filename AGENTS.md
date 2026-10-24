# Piante — contratto operativo per agenti

Ambito: repository pubblico `gernotfound/piante`, **sito web** responsive, non PWA. I documenti operativi e la documentazione di configurazione vivono qui e in `.agents/rules/`, **non nel README**. Il README non va ricreato, riempito o usato come diario di progetto.

## Convenzioni
- **MUST**: vincolo di prodotto o di sicurezza.
- **VERIFY**: condizione da osservare in codice, test o provider prima di dichiararla vera.
- **NOTE**: informazione storica, non prova dello stato live.

Prima di intervenire: controllare l'HEAD di `main`, questo file, le regole pertinenti, il codice, i chiamanti, i test e il workflow. Se documentazione e runtime divergono, verificarli e correggere entrambi. Non modificare `gernotfound/logbook`: è un riferimento per le **convenzioni**, non una dipendenza né un archivio da importare.

## Quali regole leggere
- **Dati, pubblicazione, sicurezza Firestore:** [`.agents/rules/firestore-and-publication.md`](.agents/rules/firestore-and-publication.md).
- **Firebase, login Google, console/provider, accessi:** [`.agents/rules/firebase-services.md`](.agents/rules/firebase-services.md), poi [`docs/firebase-configurazione.md`](docs/firebase-configurazione.md).
- **UI responsive, foto e quote del piano gratuito:** [`.agents/rules/design-and-media.md`](.agents/rules/design-and-media.md), [`docs/design.md`](docs/design.md).
- **Test, branch, deploy, rollout e rollback:** [`.agents/rules/verification-and-release.md`](.agents/rules/verification-and-release.md).

Leggere l'unione dei documenti quando un task attraversa più confini. Non considerare i contratti una prova automatica della loro implementazione.

## Product scope
- **MUST:** sito web con homepage pubblica `/`, login Google `/login`, archivio privato `/app`, vetrina `/:username`, scheda `/:username/:plantSlug`.
- **MUST:** i tag sono creati dal proprietario, possono essere assegnati alle piante e sono usati come filtri pubblici *soltanto se pubblicati*.
- **MUST:** ogni pianta nasce privata; la vetrina e ogni singola proiezione pubblica richiedono opt-in. Nessun carrello, pagamento, prezzo o contatto pubblico automatico.
- **MUST:** nessuna PWA, Service Worker, manifest installabile, migrazione dati da `pianta`, integrazione Vercel o blocco offline-first.
- **SHOULD:** semplice HTML/CSS/ES modules con dipendenze limitate; mantenere layout accessibile su smartphone/desktop, tastiera, riduzione del movimento e immagini leggere.

## Sicurezza e dati
- **MUST:** `profiles/{uid}` è privato. `public_gardens/{username}` è una proiezione separata, composta solo dai campi esplicitamente condivisi; la visibilità è disattivabile senza cancellare dati.
- **MUST:** le scritture private/pubbliche correlate sono atomiche e soggette a Security Rules server-side. Non introdurre operazioni che creino una vista pubblica divergente.
- **MUST:** l'identificazione con Google non autorizza da sola a gestire dati: serve il grant amministrativo `access_grants/{uid}.enabled == true`. Il browser non può creare questi grant.
- **MUST:** dati, token, email, UID e segreti personali non vanno nei file di un repository pubblico.
- **MUST:** immagini inserite in `web/images` sono pubbliche per URL e per cronologia Git, anche quando la scheda è privata. Non usarle come archivio fotografico protetto.
- **MUST:** non modificare o cancellare dati Firestore/Auth live, Rules live, origini OAuth, IAM, Hosting o servizi condivisi soltanto a seguito di un refactoring GitHub.
- **VERIFY:** le Rules versionate non sono necessariamente quelle distribuite. Firebase Auth, Firestore e Google OAuth live non sono stati collaudati durante l'implementazione della v1.

## Operatività e verifica
- Classificare **CRITICAL** Auth, Rules, proiezioni pubblico/privato, media e dati utente. Verificare casi positivi/negativi, concorrenza, rollback e failure path.
- Usare branch dedicato, PR e controlli GitHub sull'esatto commit candidato, poi verificare `main` dopo il merge. Nessun bypass del controllo richiesto.
- I controlli locali e la CI Emulator/Chromium non dimostrano un deploy Firebase, l'OAuth live o l'assenza di regressioni in produzione.
- Il repository ha un `firebase.json` per Hosting statico. **Non** contiene una sezione Firestore: evitare il deploy automatico delle Rules candidate durante un futuro deploy Hosting.
- Per il rilascio servono inventario Firebase live, Web App config pubblica verificata, grant per l'account di test, audit Rules live, test browser reali con backend, piano di cancellazione account e autorizzazione per le modifiche esterne necessarie. Non attivare costi/Blaze.
- Documentare in `docs/firebase-configurazione.md` stato, data, evidenza e limiti di ogni verifica provider.

## Stato osservato al 24/10/2026
- **GITHUB-OBSERVED:** codice frontend statico e test Node, browser Chromium e Firestore Emulator in GitHub; il repository contiene codice e Rules candidate.
- **NOT-VERIFIED:** configurazione dell'app Web Firebase, OAuth reale, Rules attive, Hosting runtime e piano effettivo. `web/firebase-config.mjs` non ha ancora API key Web/App ID.
- Nessun account reale, dato o servizio Firebase è stato modificato per la preparazione di questa revisione.
