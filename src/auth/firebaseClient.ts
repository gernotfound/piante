import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { parseFirebaseWebConfig } from './firebaseConfig';
import type { AuthGateway } from './session';

/** Lazy-loaded only in explicit test mode; never touches the legacy app's config. */
export function createAuthTestGateway():AuthGateway{
 const config=parseFirebaseWebConfig({
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:import.meta.env.VITE_FIREBASE_APP_ID
 });
 const app=getApps().some(x=>x.name==='piante-test')?getApp('piante-test'):initializeApp(config,'piante-test');
 const auth=getAuth(app);auth.languageCode='it';
 const db=getFirestore(app); // Firebase Web defaults to in-memory cache, no second IndexedDB store.
 return {
  subscribe(listener){
   return onAuthStateChanged(auth,user=>listener(user?.uid??null),()=>listener(null,new Error('Auth observer failed')));
  },
  async getGrant(uid){
   const document=await getDoc(doc(db,'piante_access',uid));
   return document.exists()&&document.data().enabled===true;
  },
  async signIn(){
   await setPersistence(auth,browserLocalPersistence);
   const provider=new GoogleAuthProvider();
   provider.setCustomParameters({prompt:'select_account'});
   await signInWithPopup(auth,provider);
  },
  async signOut(){await signOut(auth);}
 };
}
