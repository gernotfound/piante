import {pathToFileURL} from "node:url";
const REQUIRED=["Static & unit checks","Firestore Rules Emulator","Responsive browser smoke"];
export async function verifyChecks({token,sha,fetcher=fetch}){
  if(!/^[a-f0-9]{40}$/.test(sha||""))throw Error("Commit SHA non valido");
  if(!token)throw Error("GitHub checks token mancante");
  const res=await fetcher("https://api.github.com/repos/gernotfound/piante/commits/"+sha+"/check-runs?per_page=100",{
    headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token}
  });
  if(!res.ok)throw Error("GitHub checks API HTTP "+res.status);
  const payload=await res.json();
  if(!Array.isArray(payload.check_runs))throw Error("Risposta GitHub checks inattesa");
  const missing=REQUIRED.filter(name=>!payload.check_runs.some(c=>
    c.name===name && c.head_sha===sha && c.status==="completed" && c.conclusion==="success"));
  if(missing.length)throw Error("Main CI non completamente verde: "+missing.join(", "));
  return true;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const sha=process.env.GITHUB_SHA;
    await verifyChecks({token:process.env.GH_CHECKS_TOKEN,sha});
    console.log("Required CI verde per exact SHA: "+sha);
  }catch(e){console.error(e.message);process.exitCode=1;}
}
