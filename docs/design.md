# Design e benchmark — 23 ottobre 2026

Obiettivo: **vetrina botanica personale**, non un negozio. Riferimenti esaminati senza duplicarne design proprietari:

- **The Sill**: grandi fotografie, titoli editoriali marcati, contrasto chiaro e invito all'esplorazione. https://www.thesill.com/
- **Patch Plants**: catalogo responsive, ricerca e filtri leggibili, schede botaniche con gerarchia di contenuti. Studio UX dell'ex responsabile del design: https://www.antheajackson.com/design-at-patch-plants
- **MDN responsive images**: immagini adattive, \`loading\`, \`srcset\` quando esistono più versioni. https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images

## Decisioni
- Fondo avorio \`#f8f7f2\`, verde \`#183e32\`, salvia \`#879f82\`, superfici \`#e8eee5\`.
- Georgia serif nei titoli (nessun download di font), sans-serif di sistema per interazione/leggibilità.
- Homepage editoriale con illustrazione botanica vettoriale originale.
- Vetrina con ricerca, tag pill, schede fotografiche e vista dettaglio; nessuna etichetta prezzo/acquisto.
- Su desktop griglia 3 colonne; su mobile 2, senza sidebar obbligatoria. Formulari su una colonna sotto 760 px.
- Non inventare foto/collezioni: prima della pubblicazione si mostra lo stato vuoto del giardino.
- Immagini iniziali solo WebP locali o URL HTTPS; WebP locale ottimizzato da canvas massimo 1400 px, qualità ~78. Poiché statiche, le foto caricate sul repository pubblico **non sono private**.
- Contatti non implementati: in futuro consentire ai proprietari una scelta consapevole del canale pubblico e difese antispam.

## Limiti verificabili
Questa release non ha un test reale di accessibilità su mobile, una prova end-to-end Firebase o metriche Core Web Vitals. Il layout è progettato responsive nel CSS, non ancora certificato su dispositivi.
