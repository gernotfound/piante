import { readdir, readFile, stat, access } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
try {
  await access(new URL("../README.md",import.meta.url));
  throw new Error("Il progetto usa AGENTS.md; non aggiungere README.md.");
} catch(error) {
  if(error.code !== "ENOENT") throw error;
}
const paths = [];
async function walk(dir, parent="") {
  for (const entry of await readdir(new URL(dir, root), {withFileTypes:true})) {
    const current=join(parent,entry.name);
    if (entry.isDirectory()) await walk(dir + entry.name + "/",current);
    else if (entry.isFile()) paths.push(current);
  }
}
await walk("web/");
const forbidden = ["sw.js", "service-worker.js", "manifest.webmanifest"];
for(const path of paths) if(forbidden.includes(path.split("/").at(-1)))throw new Error("PWA residue: "+path);
const firebase = JSON.parse(await readFile(new URL("../firebase.json",import.meta.url),"utf8"));
if(firebase.hosting?.site!=="piante"||firebase.hosting?.public!=="web"||!Array.isArray(firebase.hosting.rewrites)) throw new Error("Hosting Firebase inatteso");
if(firebase.firestore || firebase.storage || firebase.functions)throw new Error("No Rules/Storage/Functions automatici da firebase.json.");
const html=await readFile(new URL("../web/index.html",import.meta.url),"utf8");
if(!html.includes('name="viewport"')||!html.includes('src="/scripts/app.mjs"'))throw new Error("Entry HTML incompleta");
const code=await readFile(new URL("../web/scripts/app.mjs",import.meta.url),"utf8");
if(code.includes("serviceWorker.register")||code.includes("localStorage.setItem"))throw new Error("Persistenza PWA non ammessa.");
for(const path of paths.filter(p=>p.endsWith(".mjs"))) {
  if((await stat(new URL("../web/"+path,import.meta.url))).size===0)throw new Error("Modulo vuoto: "+path);
}
console.log("Static preflight OK. Nessun deploy eseguito.");
