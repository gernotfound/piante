## Scopo e modifiche

Descrivere cosa cambia e perché, distinguendo modifiche estetiche, funzionali e di sicurezza.

## Sicurezza e rischio

- [ ] Nessuna credenziale privata, token, JSON di service account o dati personali nel diff
- [ ] Modifiche a Firebase Auth/Firestore/Rules esplicitate e motivate; non sono incluse nel solo deploy Hosting
- [ ] Nessuna modifica non autorizzata a ruoli IAM, billing o dati di produzione
- [ ] Dipendenze e GitHub Actions aggiornate con versioni controllate

## Verifiche sul candidato

- [ ] Sintassi, unit test, Rules emulator e CodeQL riusciti sul commit candidato
- [ ] Gate `Canonical Verification` verde
- [ ] Diff, effetti collaterali e procedure di recupero controllati
- [ ] I controlli browser/manuali non eseguiti sono dichiarati esplicitamente

## Rilascio

- [ ] Merge verso `main` autorizzato
- [ ] I workflow di produzione useranno l'esatto SHA verificato
- [ ] Dopo il merge: distinguere CI, release Hosting e prove nel browser reale

> Il repository è pubblico. La `apiKey` della Web App Firebase è una configurazione client prevista; le chiavi private e i token amministrativi non devono mai essere committati. Un alert GitHub si valuta verificando le restrizioni API, non nascondendo la chiave in variabili frontend.
