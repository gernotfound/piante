import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onIdTokenChanged,
  setPersistence, browserLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { watchServerGrant } from './grantWatch';
import { parseFirebaseWebConfig } from './firebaseConfig';
import type { AuthGateway } from './session';

/** Only imported behind the invite-only dev flag. NEVER opens public signup. */
export function createAuthTestGateway():AuthGateway {
  const config=parseFirebaseWebConfig({
    apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId:import.meta.env.VITE_FIREBASE_APP_ID
  });
  const app=getApps().some(x=>x.name==='piante-test')
    ?getApp('piante-test'):initializeApp(config,'piante-test');
  const auth=getAuth(app);
  auth.languageCode='it';
  const db=getFirestore(app); // memory-only SDK cache; IndexedDB is sole durable store
  return {
    subscribe(listener){
      const offToken=onIdTokenChanged(auth,user=>listener(user?.uid??null),
        ()=>listener(null,new Error('Auth observer failed')));
      // Firebase offline token persistence is not a fresh grant proof.
      // Force the authorized local view closed immediately on an offline signal.
      const offline=()=>listener(null,new Error('Network offline'));
      const online=()=>listener(auth.currentUser?.uid??null);
      const foreground=()=>{
        if(document.visibilityState==='visible')listener(auth.currentUser?.uid??null);
      };
      window.addEventListener('offline',offline);
      window.addEventListener('online',online);
      document.addEventListener('visibilitychange',foreground);
      if(!navigator.onLine)offline();
      return ()=>{
        offToken();
        window.removeEventListener('offline',offline);
        window.removeEventListener('online',online);
        document.removeEventListener('visibilitychange',foreground);
      };
    },
    watchGrant(uid,listener){return watchServerGrant(db,uid,listener);},
    async signIn(){
      await setPersistence(auth,browserLocalPersistence);
      const provider=new GoogleAuthProvider();
      provider.setCustomParameters({prompt:'select_account'});
      await signInWithPopup(auth,provider);
    },
    async signOut(){await signOut(auth);}
  };
}
