# Design e benchmark — 23 ottobre 2026

Obiettivo: **vetrina botanica personale**, non un negozio. Riferimenti esaminati senza duplicarne design proprietari:

- **The Sill**: grandi fotografie, titoli editoriali marcati, contrasto chiaro e invito all'esplorazione. https://www.thesill.com/
- **Patch Plants**: catalogo responsive, ricerca e filtri leggibili, schede botaniche con gerarchia di contenuti. Studio UX dell'ex responsabile del design: https://www.antheajackson.com/design-at-patch-plants
- **MDN responsive images**: immagini adattive, `loading`, `srcset` quando esistono più versioni. https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images

## Decisioni
- Fondo avorio `#f8f7f2`, verde `#183e32`, salvia `#879f82`, superfici `#e8eee5`.
- Georgia serif nei titoli (nessun download di font), sans-serif di sistema per interazione/leggibilità.
- Homepage editoriale con illustrazione botanica vettoriale originale.
- Vetrina con ricerca, tag pill, schede fotografiche e vista dettaglio; nessuna etichetta prezzo/acquisto.
- Su desktop griglia 3 colonne; su mobile 2, senza sidebar obbligatoria. Formulari su una colonna sotto 760 px.
- Non inventare foto/collezioni: prima della pubblicazione si mostra lo stato vuoto del giardino.
- Foto nuove caricate dal pannello, ottimizzate in WebP massimo 1080px e 120KiB, conservate in Firestore con visibilità esplicita. Eventuali URL HTTPS/asset statici precedenti restano pubblici per URL.
- Contatti non implementati: in futuro consentire ai proprietari una scelta consapevole del canale pubblico e difese antispam.

## Limiti verificabili
Questa release non ha un test reale di accessibilità su mobile, una prova end-to-end Firebase o metriche Core Web Vitals. Il layout è progettato responsive nel CSS ed è controllato tramite smoke test in Chromium e WebKit a 320, 375, 768 e 1440 px; non è ancora certificato su dispositivi reali.

## Media caricate dal profilo — v1
Il form della pianta accetta ora una foto caricata dal dispositivo e la ottimizza automaticamente in WebP prima del salvataggio. Niente caricamento manuale dei file su GitHub per le nuove foto. La fotografia può rimanere privata anche quando la pianta è in collezione; nella vetrina appare solo se selezionata e il giardino è visibile. La galleria mostra un placeholder SVG finché la foto Firestore non è stata recuperata vicino al viewport. Limiti: 1 foto per pianta, 1080px e 120KiB, budget Spark.
