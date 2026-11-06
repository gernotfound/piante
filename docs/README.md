# Piante — indice documentazione

Questa cartella contiene **contesto operativo e tecnico**, non segreti e non certificazioni automatiche del sistema live.

| Documento | Scopo | Natura |
|---|---|---|
| [AGENTS.md](../AGENTS.md) | Istruzioni principali e mappa dei contratti | Normativo per il lavoro nel repository |
| [Regola servizi esterni](../.agents/rules/external-services.md) | IAM, credenziali, provider, quote e sicurezza | Contratto operativo |
| [Regola Firebase](../.agents/rules/firebase-config.md) | Auth, catalogo privato/pubblico, Rules e Hosting | Contratto tecnico |
| [Architettura](architecture/overview.md) | Boundary, file e flussi dati del sito | Descrizione del codice da verificare |
| [Design Mobile First](design/mobile-first.md) | Palette, breakpoint, UX del vivaio e compatibilità browser | Decisioni frontend e piano di verifica |
| [Registro servizi esterni](operations/external-services-register.md) | Cosa è stato fatto/dichiarato, cosa resta da verificare | Registro operativo, non verità live permanente |
| [Runbook Hosting](operations/firebase-hosting-runbook.md) | Procedura di autorizzazione GitHub, pubblicazione, controlli e rollback | Istruzioni; non prova di esecuzione |
| [Sicurezza GitHub](operations/github-security-runbook.md) | Ruleset main, status check, CodeQL, Dependabot e API key Firebase client | Contratto candidato e verifiche esterne necessarie |

## Aggiornamenti

Quando viene modificato un servizio esterno, aggiornare il registro con **data, origine della prova, stato e azioni pendenti**. Non duplicare valori segreti né confondere provider attivo, configurazione nel repository, test CI e deploy reale.

Le decisioni di prodotto restano distinte dalle ipotesi; non trasformare un passaggio non ancora eseguito in uno stato completato. I dettagli del runtime hanno fonte nei file eseguibili del repository.
