/** Public Firebase Web config. A project mismatch must not route users to legacy. */
export interface FirebaseWebConfig { apiKey:string; authDomain:'piante.web.app'; projectId:'pianta-db'; appId:string; }
export interface FirebaseWebEnv { apiKey?:string; authDomain?:string; projectId?:string; appId?:string; }
export function parseFirebaseWebConfig(env:FirebaseWebEnv):FirebaseWebConfig {
  const {apiKey,authDomain,projectId,appId}=env;
  if(!apiKey?.trim()||!appId?.trim())throw new Error('Configurazione Firebase Web incompleta');
  if(projectId!=='pianta-db')throw new Error('Firebase projectId inatteso');
  if(authDomain!=='piante.web.app')throw new Error('Firebase authDomain non autorizzato');
  return {apiKey:apiKey.trim(),authDomain,projectId,appId:appId.trim()};
}
export function authTestModeEnabled(v:string|undefined):boolean { return v==='true'; }
