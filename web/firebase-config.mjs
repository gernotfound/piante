// Configurazione Web Firebase PUBBLICA per anteprime locali esplicite.
// Su https://piante.web.app, se API key e App ID sono vuoti,
// web/scripts/firebase-web-config.mjs usa SOLO /__/firebase/init.json
// di Firebase Hosting e valida il progetto pianta-db.
// Non inserire mai credenziali amministrative, token o service account.
export const firebaseConfig = Object.freeze({
  apiKey: "",
  appId: "",
  projectId: "pianta-db",
  authDomain: "piante.web.app"
});
