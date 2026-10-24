import { resolveFirebaseWebConfig } from "./firebase-web-config.mjs";

let clientPromise;

/**
 * Use the same-origin Hosting config only when the project and Auth domain
 * have been validated. An unavailable or malformed config fails closed.
 */
export function loadFirebase() {
  if (!clientPromise) clientPromise = (async () => {
    const firebaseConfig = await resolveFirebaseWebConfig();
    const base = "https://www.gstatic.com/firebasejs/12.19.0/";
    const [app, auth, firestore] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js")
    ]);
    const firebaseApp = app.initializeApp(firebaseConfig);
    const firebaseAuth = auth.getAuth(firebaseApp);
    firebaseAuth.languageCode = "it";
    return {
      auth: firebaseAuth,
      db: firestore.getFirestore(firebaseApp),
      api: { ...auth, ...firestore }
    };
  })().catch(error => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}
