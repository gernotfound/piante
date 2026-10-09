import { useEffect, useState } from 'react';
import { authTestModeEnabled } from './firebaseConfig';
import { AuthSessionController, type AccessState } from './session';
import { PrivateGarden } from '../private/PrivateGarden';

const authEnabled = authTestModeEnabled(import.meta.env.VITE_AUTH_TEST_MODE);

/** Test-only sign-in. No privileged operations or personal data access in this milestone. */
export function AuthTestPanel() {
 const [state,setState]=useState<AccessState>({status:'initializing'});
 const [controller,setController]=useState<AuthSessionController|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!authEnabled)return;
  let disposed=false;let instance:AuthSessionController|undefined;
  void import('./firebaseClient').then(({createAuthTestGateway})=>{
   if(disposed)return;
   instance=new AuthSessionController(createAuthTestGateway());
   instance.onChange(setState);instance.start();setController(instance);
  }).catch(()=>{
   if(!disposed)setState({status:'error',message:'Configurazione Firebase non disponibile'});
  });
  return()=>{disposed=true;instance?.dispose();};
 },[]);
 if(!authEnabled)return null;
 const act=async(method:'signIn'|'signOut')=>{
  if(!controller||busy)return;
  setError('');setBusy(true);
  try{await controller[method]();}
  catch{setError(method==='signOut'?'Disconnessione non riuscita':'Accesso Google non riuscito: verifica dominio OAuth e configurazione Firebase.');}
  finally{setBusy(false);}
 };
 return <section className="auth-test-panel" aria-label="Accesso sperimentale">
   <h2>Accesso Google · Test</h2>
   <p>Il login è riservato agli account autorizzati. Nessun dato botanico viene ancora sincronizzato.</p>
   {state.status==='initializing'||state.status==='checking'?<p role="status">Verifica autorizzazioni in corso…</p>:null}
   {state.status==='denied'?<p role="alert">Account non abilitato per Piante.</p>:null}
   {state.status==='authorized'?<p role="status">Accesso test autorizzato: {state.uid}</p>:null}
   {state.status==='error'?<p role="alert">{state.message}</p>:null}
   {error?<p role="alert">{error}</p>:null}
   {state.status==='signed-out'?<button type="button" disabled={busy||!controller} onClick={()=>void act('signIn')}>Accedi con Google (test)</button>
    :<button type="button" disabled={busy||!controller} onClick={()=>void act('signOut')}>Disconnetti</button>}
   {state.status==='authorized' ? <PrivateGarden key={state.uid} ownerScope={state.ownerScope}
     isStillAuthorized={()=>controller?.state.status==='authorized' && controller.state.uid===state.uid} /> : null}
 </section>;
}
