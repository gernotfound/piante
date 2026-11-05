// Configurazione pubblica dell'app Web Firebase "piante".
// NON salvare qui credenziali amministrative, password o chiavi di servizio.
export const firebaseConfig = {
  apiKey: "AIzaSyBL_AcrAZvyShaTeNTgC80t8mc1UBzBbrs",
  authDomain: "piante-a617e.firebaseapp.com",
  projectId: "piante-a617e",
  storageBucket: "piante-a617e.firebasestorage.app",
  messagingSenderId: "401886801214",
  appId: "1:401886801214:web:506eacd21c2e40ad52d06f"
};

export const firebaseConfigured =
  firebaseConfig.apiKey !== "INSERISCI_API_KEY" &&
  firebaseConfig.appId !== "INSERISCI_APP_ID";
