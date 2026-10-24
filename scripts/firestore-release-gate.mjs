import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

export const FIRESTORE_PROJECT = "pianta-db";
export const LIVE_RELEASE = "projects/pianta-db/releases/cloud.firestore";
const RULESET_PATTERN = /^projects\/pianta-db\/rulesets\/[a-zA-Z0-9_-]+$/;

export function normalizedRules(source) {
  if(typeof source!=="string" || !source.trim()) throw Error("Sorgente Rules vuota");
  return source.replace(/\r\n/g,"\n").split("\n")
    .map(line=>line.trim()).filter(line=>line&&!line.startsWith("//"))
    .join(" ").replace(/\s+/g," ").trim();
}
export function rulesDigest(source) {
  return createHash("sha256").update(normalizedRules(source)).digest("hex");
}
function rulesFile(payload) {
  const files=payload?.source?.files;
  if(!Array.isArray(files))throw Error("Il ruleset live non contiene sorgenti");
  const found=files.filter(file=>typeof file.content==="string" &&
    file.content.includes("service cloud.firestore"));
  if(found.length!==1)throw Error("Il ruleset live non ha un'unica sorgente Cloud Firestore");
  return found[0].content;
}
async function readJson(fetcher,url,token) {
  const response=await fetcher(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
    headers:{Accept:"application/json",Authorization:"Bearer "+token}});
  if(!response.ok)throw Error("Firebase Rules API HTTP "+response.status);
  return await response.json();
}
export async function readLiveRules({fetcher=fetch,token}) {
  if(typeof token!=="string"||token.length<10)throw Error("Token WIF non disponibile");
  const base="https://firebaserules.googleapis.com/v1/";
  const release=await readJson(fetcher,base+LIVE_RELEASE,token);
  if(!RULESET_PATTERN.test(release.rulesetName??""))throw Error("Nome ruleset live inatteso");
  const ruleset=await readJson(fetcher,base+release.rulesetName,token);
  return {rulesetName:release.rulesetName,source:rulesFile(ruleset)};
}
export function classifyRules({live,desired,legacy}) {
  return {
    liveRuleset:live.rulesetName,
    liveDigest:rulesDigest(live.source),
    desiredDigest:rulesDigest(desired),
    legacyDigest:rulesDigest(legacy),
    matchesDesired:normalizedRules(live.source)===normalizedRules(desired),
    matchesOwnerSnapshot:normalizedRules(live.source)===normalizedRules(legacy),
    retiresLegacyUsers:/match\s+\/users\/\{/.test(live.source) && !/match\s+\/users\/\{/.test(desired)
  };
}
export function validateDeployGate({classification,expectedRuleset,confirmation,legacyConfirmation}) {
  if(!RULESET_PATTERN.test(expectedRuleset??"") ||
      expectedRuleset!==classification.liveRuleset) {
    throw Error("Rules live cambiate dall'ultimo audit: nuova verifica obbligatoria");
  }
  if(confirmation!=="DEPLOY_PIANTA_DB_RULES") {
    throw Error("Conferma esplicita del deploy mancante");
  }
  if(classification.matchesDesired)throw Error("Le Rules live sono già allineate: nessun deploy");
  if(classification.retiresLegacyUsers &&
      legacyConfirmation!=="RETIRE_LEGACY_USERS_ACCESS") {
    throw Error("La modifica bloccherà /users: serve conferma di cutover separata");
  }
  return true;
}
export function verifyDesiredRules(classification) {
  if(!classification.matchesDesired)throw Error("Rules live diverse dal commit GitHub: verifica fallita");
  return true;
}
export async function run(mode,{
  token=process.env.GCP_ACCESS_TOKEN,
  fetcher=fetch,
  desiredPath=new URL("../firestore.rules",import.meta.url),
  baselinePath=new URL("../docs/operations/firestore-rules-legacy-20261024.rules",import.meta.url),
  expectedRuleset=process.env.EXPECTED_LIVE_RULESET,
  confirmation=process.env.DEPLOY_CONFIRMATION,
  legacyConfirmation=process.env.LEGACY_CUTOVER_CONFIRMATION
}={}) {
  if(!["audit","preflight","verify"].includes(mode))throw Error("Modalità non consentita");
  const [desired,legacy,live]=await Promise.all([
    readFile(desiredPath,"utf8"),readFile(baselinePath,"utf8"),
    readLiveRules({fetcher,token})
  ]);
  const classification=classifyRules({desired,legacy,live});
  if(mode==="audit"){
    console.log("Project: "+FIRESTORE_PROJECT+"; database: (default)");
    console.log("Ruleset live: "+classification.liveRuleset);
    console.log("SHA256 live: "+classification.liveDigest);
    console.log("SHA256 GitHub: "+classification.desiredDigest);
    console.log("Snapshot 2026-10-24: "+(classification.matchesOwnerSnapshot?"coincide":"differisce"));
    console.log("Rules già desiderate: "+(classification.matchesDesired?"sì":"no"));
    console.log("Cambio /users: "+(classification.retiresLegacyUsers?"sì — richiede conferma speciale":"no"));
    console.log("Sola lettura: nessuna modifica effettuata");
  } else if(mode==="preflight"){
    validateDeployGate({classification,expectedRuleset,confirmation,legacyConfirmation});
    console.log("Preflight: live ruleset corrisponde all'audit e conferme valide.");
  } else {
    verifyDesiredRules(classification);
    console.log("Read-back: Rules live corrispondono esattamente alla sorgente normalizzata su main.");
    console.log("Ruleset live: "+classification.liveRuleset);
  }
  return classification;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{await run(process.argv[2]??"audit");}
  catch(error){console.error("Firestore Rules: "+(error?.message||"verifica non riuscita"));process.exitCode=1;}
}
