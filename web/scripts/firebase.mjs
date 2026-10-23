import { firebaseConfig } from "../firebase-config.mjs";

export function firebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.appId &&
    firebaseConfig.projectId === "pianta-db" && firebaseConfig.authDomain === "piante.web.app");
}
let clientPromise;
export function loadFirebase() {
  if (!firebaseConfigured()) throw new Error("Firebase non è ancora configurato. Consultare README.md.");
  if (!clientPromise) clientPromise = (async () => {
    const base = "https://www.gstatic.com/firebasejs/12.19.0/";
    const [app, auth, firestore] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js")
    ]);
    const firebaseApp = app.initializeApp(firebaseConfig);
    const firebaseAuth = auth.getAuth(firebaseApp);
    firebaseAuth.languageCode = "it";
    return { auth:firebaseAuth, db:firestore.getFirestore(firebaseApp), api:{...auth,...firestore} };
  })().catch(error => { clientPromise = null; throw error; });
  return clientPromise;
}
