import { pathToFileURL } from "node:url";
import { validateFirebaseWebConfig, FIREBASE_SITE_ORIGIN } from "../web/scripts/firebase-web-config.mjs";

const MAX_RESPONSE_BYTES = 60000;
async function get(fetcher, path, accept) {
  const response = await fetcher(new URL(path, FIREBASE_SITE_ORIGIN), {
    method:"GET", redirect:"error", credentials:"omit",
    signal:AbortSignal.timeout(12000),
    headers:{Accept:accept,"Cache-Control":"no-cache"}
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const size=Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size>MAX_RESPONSE_BYTES) throw new Error("Response too large");
  const body=await response.text();
  if (Buffer.byteLength(body,"utf8")>MAX_RESPONSE_BYTES) throw new Error("Response too large");
  return {response,body};
}
export function describeNetworkFailure(error) {
  if(error?.name==="TimeoutError")return "Timeout di rete";
  const code=error?.cause?.code;
  if(["ENOTFOUND","EAI_AGAIN"].includes(code))return "DNS non risolto";
  if(["ECONNREFUSED","ENETUNREACH","ETIMEDOUT"].includes(code))return "Collegamento di rete fallito";
  if(["CERT_HAS_EXPIRED","UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code))return "Certificato TLS non valido";
  if(/^HTTP [45][0-9]{2}$/.test(error?.message||""))return error.message;
  return "Connessione HTTP non disponibile";
}
export async function inspectHostingSite(fetcher) {
  const checks=[];
  const check=(name,ok,detail)=>checks.push({name,ok,detail});
  try {
    const {response,body}=await get(fetcher,"/","text/html");
    const isHtml=response.headers.get("content-type")?.toLowerCase().includes("text/html");
    const correct=Boolean(isHtml&&body.includes('src="/scripts/app.mjs"')&&body.includes('id="app"'));
    check("homepage",correct,correct?"Nuova homepage Piante rilevata":"Homepage non corrispondente al nuovo sito");
    const security=response.headers.get("x-content-type-options")==="nosniff"&&Boolean(response.headers.get("content-security-policy"));
    check("security_headers",security,security?"CSP e nosniff rilevati":"CSP e/o nosniff assenti");
  } catch(error) {
    const reason=describeNetworkFailure(error);
    check("homepage",false,"Homepage: "+reason);
    check("security_headers",false,"Header: "+reason);
  }
  try {
    const {response,body}=await get(fetcher,"/__/firebase/init.json","application/json");
    if(!response.headers.get("content-type")?.toLowerCase().includes("application/json"))throw Error("Not JSON");
    validateFirebaseWebConfig(JSON.parse(body));
    check("firebase_config",true,"Progetto pianta-db e Web config pubblica validati");
  } catch(error) {
    check("firebase_config",false,"Endpoint init.json: "+describeNetworkFailure(error));
  }
  try {
    const {response,body}=await get(fetcher,"/scripts/app.mjs","text/javascript");
    const js=/javascript|ecmascript/i.test(response.headers.get("content-type")??"");
    const correct=js&&body.includes("loadFirebase")&&body.includes("makeDataClient");
    check("app_module",correct,correct?"Modulo applicazione presente":"Modulo applicazione non corrispondente");
  } catch(error) {
    check("app_module",false,"Modulo JS: "+describeNetworkFailure(error));
  }
  return {origin:FIREBASE_SITE_ORIGIN,ready:checks.every(x=>x.ok),checks};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await inspectHostingSite(fetch);
  console.log("Preflight Hosting pubblico: "+report.origin);
  for(const c of report.checks)console.log((c.ok?"PASS":"BLOCK")+" "+c.name+": "+c.detail);
  if(!report.ready) {
    console.error("Controllo non superato; nessun deploy o modifica effettuata.");
    process.exitCode=1;
  }
}
