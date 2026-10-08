# Architettura — Piante

## Confini

| Contesto | Responsabilità |
| --- | --- |
| UI | Stato di navigazione, presentazione e accessibilità |
| Dominio | Esemplari botanici, propagazione, diario, luoghi, cure, pubblicazione |
| Repository locale | IndexedDB owner-scoped e journal di operazioni durevoli |
| Replica cloud | Firestore con validazione, migrazioni e retry |
| Proiezione pubblica | Schede con campi consentiti e snapshot confermati |
| Ambiente | Meteo e allerte per luoghi con soglie per esemplare |
| Account | Login, ownership, logout, backup e cancellazione |

## Schema target (PROPOSTA, non live)

```text
piante_users/{uid}
  plants/{plantId}
    events/{eventId}
  places/{placeId}
  images/{imageId}
  expenses/{expenseId}
  wishlist/{itemId}
  settings/{documentId}
piante_profiles/{username}
  plants/{publicPlantId}
  media/{mediaId}
```

Il nome `piante_*` è un namespace di migrazione, non uno schema version.
Le collezioni legacy `users/{uid}/...` non vanno alterate durante il bootstrap.

## Principi
1. Esemplare distinto da specie e cultivar; eventuale identità di madre, padre e propagazioni con ID stabili.
2. Date botaniche locali `YYYY-MM-DD`; timestamp di audit come istanti assoluti.
3. Immagini e diari non ingrossano i documenti esemplare; liste e anteprime restano leggere.
4. Dati remoti trattati come input non fidato e validati con Zod.
5. Preferenze UI, dati privati e proiezioni pubbliche hanno cicli di vita separati.
6. Il modello di sincronizzazione deve preservare cambi concorrenti e gestire gli ack persi.
7. Le quote Firestore Spark fanno parte dei requisiti di prodotto; evitare listener pubblici indiscriminati.

## Sequenza milestone
- **M0**: shell, design system iniziale, route parser testato, CI e contratti (no accesso Firebase).
- **M1**: schema botanico, persistenza IndexedDB, operazioni di dominio e unit test.
- **M2**: Auth, Rules private e replica Firestore, con Emulator e stress/recovery.
- **M3**: collezioni, esemplari, foto, luoghi e propagazione.
- **M4**: diario, cure, raccolti, grafici.
- **M5**: profili e pubblicazione con proiezione sicura, slug e gestione delle immagini.
- **M6**: meteo, QR, mappa, spese, wishlist e notifiche compatibili con l'infrastruttura.
- **M7**: backup/import e hardening, lifecycle e cancellazione account.
- **M8**: cutover controllato dopo verifiche e revisione.

**Nessuna versione numerica di protocolli LogBook è trasferita automaticamente.**


## Stato implementativo M1
- Modello privato di esemplare, luogo ed evento botanico con vincoli e referenze verificate.
- Reducer puro di operazioni `plant.create`, `plant.patch`, `place.create`, `place.patch`, `event.add`.
- Repository IndexedDB owner-scoped: snapshot e journal diventano durevoli atomicamente nella medesima transazione, con sequence e operation ID stabili.
- Read/commit/ack falliscono in presenza di versioni future, dati corrotti o I/O non disponibile.
- Solo foundation: nessun connettore Firestore, login, UI CRUD, pubblicazione o cancellazione account introdotti in M1.

## Stato M2a
- Gateway Auth Google dietro flag test esplicito, `authDomain` isolato su `piante.web.app`.
- Controller sessione fail-closed con owner scope e grant amministrativo esterno.
- Rules private in file test-only e suite Firebase Emulator bloccante in CI.
- **Non ancora implementati**: replica cloud, scritture con ownership, login pubblico, deploy Rules, verifiche OAuth live, cancellazione account. M2b e audit provider restano obbligatori.

## Stato M2b — confine di trasporto cloud
- Contratto append-only di operazioni private, transazioni idempotenti e Rules verificate su Firebase Emulator.
- Ricontrollo di owner, session epoch e journal durevole durante errori ambigui.
- Modulo deliberatamente **non collegato a UI/Auth e non attivo sul provider**. Nessuna hydration, merge cross-device, ack automatico, account deletion o Rules live.
- Specifica: [`docs/architecture/cloud-journal.md`](cloud-journal.md).
