/**
 * Used by npm prebuild AND Canonical Verification. No Firebase credentials,
 * deploy commands or provider calls are ever made here.
 */
import {readFileSync,existsSync} from 'node:fs';
import {assertStaticReleaseBoundary} from './release-boundary.mjs';

function readJSON(path) {
  try{return JSON.parse(readFileSync(path,'utf8'));}
  catch{throw new Error('Invalid or missing release configuration: '+path);}
}
try{
  const envFiles=['.env','.env.local','.env.production','.env.production.local']
    .filter(path=>existsSync(path))
    .map(name=>({name,content:readFileSync(name,'utf8')}));
  const result=assertStaticReleaseBoundary({
    firebaseConfig:readJSON('firebase.json'),
    projectConfig:readJSON('.firebaserc'),
    environmentFiles:envFiles,
    environment:process.env
  });
  process.stdout.write('Static release boundary OK: '+result.site+
    ' / '+result.project+'; invited login OFF; provider state unverified.\n');
}catch(error){
  process.stderr.write((error instanceof Error?error.message:'Release boundary failed')+'\n');
  process.exitCode=1;
}
