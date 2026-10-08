import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const host='127.0.0.1',port=8177,project='demo-piante-test';
const version='1.22.0',size=136707194;
const expectedHash='9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c';
const url='https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v'+version+'.jar';
const root=process.env.PIANTE_FIRESTORE_EMULATOR_CACHE||path.join(homedir(),'.cache','piante','emulators');
const jar=path.join(root,'cloud-firestore-emulator-v'+version+'.jar');
const partial=jar+'.download';
async function hash(file) {
 const h=createHash('sha256');
 for await(const chunk of createReadStream(file))h.update(chunk);
 return h.digest('hex');
}
async function valid(file){return existsSync(file)&&statSync(file).size===size&&(await hash(file))===expectedHash;}
async function ensureJar(){
 mkdirSync(root,{recursive:true});
 if(await valid(jar))return;
 rmSync(partial,{force:true});
 const response=await fetch(url);
 if(!response.ok||!response.body)throw new Error('Cannot fetch Firestore Emulator: HTTP '+response.status);
 await pipeline(Readable.fromWeb(response.body),createWriteStream(partial));
 if(!await valid(partial)){rmSync(partial,{force:true});throw new Error('Firestore Emulator checksum or size mismatch');}
 renameSync(partial,jar);
}
async function portOpen(){
 return new Promise(resolve=>{
  const socket=net.createConnection({host,port});
  const end=value=>{socket.destroy();resolve(value);};
  socket.once('connect',()=>end(true));socket.once('error',()=>end(false));
  socket.setTimeout(500,()=>end(false));
 });
}
await ensureJar();
if(await portOpen())throw new Error('Refusing to attach to an unknown emulator on port '+port);
const log=createWriteStream('firestore-debug.log');
const server=spawn('java',[
 '-jar',jar,'--host',host,'--port',String(port),
 '--rules',path.resolve('firestore.m2-test.rules'),
 '--project_id',project,'--single_project_mode','true'
],{stdio:['ignore','pipe','pipe']});
server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
try{
 const start=Date.now();
 while(!await portOpen()){
  if(server.exitCode!==null)throw new Error('Firestore Emulator exited prematurely');
  if(Date.now()-start>45000)throw new Error('Firestore Emulator startup timeout');
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 const vitest=path.resolve('node_modules/vitest/vitest.mjs');
 const child=spawn(process.execPath,[vitest,'run','--config','vitest.rules.config.ts'],{
  stdio:'inherit',env:{...process.env,FIRESTORE_EMULATOR_HOST:host+':'+port,GCLOUD_PROJECT:project}
 });
 const result=await new Promise((resolve,reject)=>{
  child.once('error',reject);child.once('exit',code=>resolve(code??1));
 });
 if(result!==0)process.exitCode=result;
}finally{
 server.kill('SIGTERM');
 if(process.platform==='win32'&&server.pid)spawnSync('taskkill',['/pid',String(server.pid),'/t','/f']);
 log.end();
}
