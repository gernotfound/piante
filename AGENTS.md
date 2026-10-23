# Piante — regole tecniche del nuovo sito

- Il repository contiene un sito **responsive** statico, NON una PWA. Non introdurre Service Worker, manifest installabile, journal offline o migrazioni dal progetto storico.
- Fonte di verità esterna: \`docs/firebase-configurazione.md\`; verificare dal provider prima di cambiare Firebase live. Project ID \`pianta-db\`, site \`piante\`. Nessuna modifica a LogBook o ad altri progetti.
- Il dominio \`/login\` usa **solo Google OAuth** nell'interfaccia; questo non disabilita automaticamente Email/Password nel provider.
- I profili \`profiles/{uid}\` sono privati. Le proiezioni \`public_gardens/{username}\` non devono contenere appunti o metadati personali non esplicitamente scelti. Un profilo pubblicato si può rendere invisibile in blocco.
- Le Rules Firestore in repository sono solo una candidata: NON distribuirle prima di audit live ed Emulator tests reali. I test Node statici non attestano l'isolamento Firestore.
- App Web priva di \`apiKey\` o \`appId\`: lasciare disabilitato il login finché non si ottiene la configurazione pubblica Web App dal provider. Mai committare service account, segreti e token.
- Firebase Storage richiede Blaze. Non attivare Blaze o fornitori terzi senza autorizzazione. Le immagini in \`web/images\` sono pubbliche e non devono essere confuse con allegati privati; la visibilità di Firestore non ne protegge gli URL.
- Fare modifiche su branch dedicato, con PR e controlli CI sullo SHA candidato. Prima di fare merge o deploy verificare la reale condizione del branch, i required checks e i contratti.
- Per un rilascio pubblico manca ancora il lifecycle di cancellazione account; non aprire account multipli liberamente senza definire questa protezione, antiabuso, modalità di recupero, quote e cancellazione media.
- L'interfaccia è ottimizzata mobile-first, tastiera/focus, contrasto e riduzione movimento. Verificare sul browser reale, non presumerne la correttezza da CSS e test statici.
