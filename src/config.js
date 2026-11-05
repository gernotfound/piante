// Copiare i valori da Firebase Console > Impostazioni progetto > Le tue app > Configurazione SDK.
// La configurazione dell'app Web NON è una credenziale segreta; non inserire password o chiavi di servizio.
export const firebaseConfig = {
  apiKey: "INSERISCI_API_KEY",
  authDomain: "piante-a617e.firebaseapp.com",
  projectId: "piante-a617e",
  appId: "INSERISCI_APP_ID"
};

export const firebaseConfigured =
  firebaseConfig.apiKey !== "INSERISCI_API_KEY" &&
  firebaseConfig.appId !== "INSERISCI_APP_ID";
