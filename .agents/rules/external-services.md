# Servizi esterni e segreti — Piantee

- Cloudflare account condiviso con TheLogBook; Piantee usa solo Worker `piantee` e D1 `piantee-db` EU. Quote Free a livello account condivise: monitorare consumi e non modificare risorse di TheLogBook.
- Kinde è il solo identity provider di Piantee: applicazione e identità owner distinte da TheLogBook, self-signup disabilitato, password e client secret configurati nel provider, mai in Git.
- Accesso amministrativo **solo** dopo verifica lato Worker della sessione firmata per il subject owner; non bastano email, parametri URL o privilegi frontend.
- Provider e repository non provano l'uno lo stato dell'altro: controllare direttamente configuration, bindings, deployments e behavior, citando data e SHA.
- Pubblicare solo output Cloudflare verificato per `main`. Non riutilizzare token di altri progetti, non allargare IAM, non introdurre servizi a pagamento senza autorizzazione.
- Per modifiche dei provider registrare nel [registro servizi](../../docs/operations/external-services-register.md) data, prove, limiti e rischi, senza identità personali o segreti.
- Firebase Auth/Firestore/Hosting sono *legacy esterni*. La pulizia del repository **non elimina** dati o account già ospitati da Firebase; prima dell'eliminazione dal provider richiedere verifica dei record, ambito e recuperabilità. Nessun deployment Firebase dal repository nuovo.
