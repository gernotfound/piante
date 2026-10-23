# Piante — il giardino digitale

Sito web statico **responsive**, non PWA, con archivio privato Google e vetrina pubblica per ogni username. Nuovo prodotto: nessuna importazione da Pianta né migrazione PWA.

## Stato attuale

**Versione di sviluppo — nessun deploy eseguito.** L'app è implementata a livello frontend e documentale, ma non è pronta per il rilascio live. La configurazione Firebase Web è ancora vuota, le Security Rules non sono state distribuite né provate su Firebase Emulator e l'accesso reale non è stato collaudato. Non inserire dati importanti prima delle verifiche complete.

Percorsi:
- \`/\`: presentazione del progetto.
- \`/login\`: login Google.
- \`/app\`: archivio privato.
- \`/app/tags\`: creazione dei tag.
- \`/app/settings\`: nome pubblico, descrizione, interruttore vetrina.
- \`/app/plants/new\`: nuova pianta.
- \`/app/plants/:id\`: modifica, controlli della pubblicazione.
- \`/:username\`: vetrina pubblica con ricerca e tag filtrabili.
- \`/:username/:plantSlug\`: dettaglio della pianta pubblica.

**Nessun carrello, pagamento, prezzi o modulo contatti nella prima versione.** I contatti potranno essere aggiunti in futuro solo dopo una scelta consapevole di privacy e protezione dallo spam.

## Design

Stile botanico editoriale: avorio, verde bosco, salvia, grandi fotografie, serif per i titoli e sans-serif per testi e controlli. La griglia passa da tre colonne desktop a due su mobile; header, filtri e form si adattano a larghezze ridotte. L'illustrazione SVG è originale e non richiede asset remoti.

Spunti analizzati:
- The Sill, per la composizione editoriale con grandi titoli;
- Patch Plants, per filtri, griglie mobile e contenuti facilmente consultabili, https://www.antheajackson.com/design-at-patch-plants.

## Firebase e sicurezza

La configurazione target nota si trova in \`docs/firebase-configurazione.md\`: progetto \`pianta-db\`, Hosting site \`piante\`, dominio \`piante.web.app\`, piano Spark (da verificare in Console).

L'app usa gli ESM Firebase JS SDK 12.19.0 dalla CDN ufficiale, senza build npm. In \`web/firebase-config.mjs\` sono lasciati vuoti \`apiKey\` e \`appId\`: il sito resta in modalità non configurata finché non si inseriscono i dati **pubblici** dalla Web App Firebase corretta. Non inserire credenziali amministrative nel codice.

Prima del rilascio:
1. Verificare configurazione live di Hosting, Auth autorizzati, OAuth, Firestore, quote Spark e Rules.
2. Verificare che Google OAuth funzioni da \`piante.web.app\` usando il popup, e decidere se disabilitare il provider Email/Password ancora abilitato sul progetto.
3. Eseguire una suite Firebase Emulator Rules: proprietario, anonimo, altro utente, username duplicati, profilo invisibile, documento pubblico malformato e ogni operazione non consentita. I test Node presenti **non sono equivalenti**.
4. Distribuire le Rules solo con autorizzazione specifica e read-back provider, poiché sostituiranno quelle legacy di \`users\`.
5. Verificare un percorso end-to-end completo: login, creazione username, scheda, tag, pubblicazione, filtro, revoca e logout su browser desktop/mobile.
6. Definire la cancellazione account completa e sicura prima di aprire eventuali registrazioni generali. La versione attuale non ha questo flusso.
7. Aggiornare la regola GitHub required-check alla nuova CI soltanto dopo averla verificata sul commit candidato.

Il dominio di pubblicazione usa solo campi selezionati esplicitamente. L'intero archivio \`profiles/{uid}\` è privato e diverso da \`public_gardens/{username}\`; il campo \`visible\` nega la lettura pubblica quando disattivato, secondo le Rules **proposte**, non quelle live.

## Immagini con Firebase Spark

Cloud Storage for Firebase richiede il piano **Blaze** dal 3 febbraio 2026, quindi non viene utilizzato: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024 .

Per ora:
1. Nell'editor della pianta, scegli la foto e usa **Scarica WebP**. Il browser la ridimensiona a max 1400 px e comprime in WebP qualità ~78.
2. Carica manualmente il file ottimizzato nella directory \`web/images/\` del repository GitHub. Creala se non esiste.
3. Inserisci nella scheda il percorso \`/images/nomefoto.webp\`.
4. Un successivo deploy Firebase Hosting pubblicherà l'asset. **Caricarlo su GitHub non significa distribuirlo automaticamente.**
5. Puoi in alternativa usare un URL HTTPS già ospitato esternamente; il formato/compressione in tal caso dipendono dal provider.

**ATTENZIONE PRIVACY:** GitHub è pubblico e gli asset statici distribuiti sono pubblicamente scaricabili, anche quando una scheda o una vetrina non sono visibili. Non caricare fotografie riservate, GPS/EXIF o altre informazioni personali. La conversione canvas WebP solitamente esclude i metadati EXIF originali, ma va controllata prima della pubblicazione. La disattivazione della scheda non cancella file già distribuiti né la cronologia Git. Per immagini realmente private occorrerà un backend storage protetto differente.

Le pagine usano \`loading="lazy"\` e \`decoding="async"\`. Quando si disporrà di più risoluzioni della stessa foto si potranno aggiungere \`srcset\` e \`sizes\` per evitare download eccessivi su mobile.

## Verifiche locali

Richiede Node.js 22+ (solo per test, non per il runtime web):

\`\`\`sh
npm run verify
\`\`\`

Per anteprima statica:
\`\`\`sh
python3 -m http.server 8080 --directory web
\`\`\`

Aprire \`http://localhost:8080\`; su localhost il login OAuth potrebbe richiedere un dominio autorizzato nella Console Firebase. Nessun deploy automatizzato è configurato.

## Documento di progetto
- \`AGENTS.md\`: regole e rischi tecnici.
- \`docs/firebase-configurazione.md\`: configurazioni provider note.
- \`docs/design.md\`: ricerca e criteri di interfaccia.
- \`firestore.rules\`: **bozza da verificare su Emulator, non deployata**.
