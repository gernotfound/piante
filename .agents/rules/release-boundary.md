# Confine di build/rilascio statico Piante — M3e

Classificazione CRITICAL per qualsiasi attivazione Auth, Rules, Hosting o cambio di destinazione.

- **MUST:** Firebase `pianta-db` è condiviso con la vecchia Pianta. Il file `firebase.json` della nuova app è solo Hosting statico per il sito `piante`. Le Rules di Emulator **non** devono mai diventare una sezione `firestore` di deploy, e nessun effetto collaterale di Storage/Functions/Database è ammesso.
- **MUST:** `VITE_AUTH_TEST_MODE` per gli artefatti build della shell pubblica è assente oppure `false`. Il controllo viene eseguito da `npm run check:release-boundary` e da Vite durante ogni `vite build`. Non aggirare il guard per pubblicare la UI test prima di lifecycle account funzionante.
- **MUST:** la CI esegue `npm run test:release-boundary` e `npm run check:release-boundary` su SHA candidato; `Canonical Verification` dipende da quel job e dagli altri gate. Nuovi file/estensioni nel target Firebase richiedono revisione dedicata, non ampliamenti impliciti della allowlist.
- **MUST:** un check statico verde non è prova di provider live, Rules compatibili, account deletion funzionante, chiave API/referrer corretti, OAuth handler, WIF né runtime. Nessun deploy finché non si verifica direttamente il provider e la continuità legacy.
- **MUST:** niente nuove credenziali, Service Account JSON, ruoli IAM o piani Blaze; mai confondere `firebase deploy --only hosting` con licenza di modificare altri prodotti nello stesso progetto.
- **MUST:** il registro esterni va aggiornato per ogni configurazione provider toccata, distinguendo GitHub/CI osservati dalla verifica esterna. In M3e nessun provider è stato modificato.
- **VERIFY:** se nuove funzionalità PWA richiedono test builds su server, predisporre un ambiente *isolato* separato e una decisione di prodotto prima di rimuovere questo blocco; l'attuale progetto shared non è un ambiente usa-e-getta.
