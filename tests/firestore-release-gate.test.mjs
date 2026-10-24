import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {classifyRules,normalizedRules,validateDeployGate,verifyDesiredRules,
  readLiveRules,LIVE_RELEASE} from "../scripts/firestore-release-gate.mjs";
import {verifyChecks} from "../scripts/verify-main-checks.mjs";

const legacy=await readFile(new URL("../docs/operations/firestore-rules-legacy-20261024.rules",import.meta.url),"utf8");
const desired=await readFile(new URL("../firestore.rules",import.meta.url),"utf8");
const liveName="projects/pianta-db/rulesets/example123";
const legacyStatus=classifyRules({live:{rulesetName:liveName,source:legacy},desired,legacy});
test("legacy rules provided by owner are archived but never treated as provider verification",()=>{
  assert.equal(legacyStatus.matchesOwnerSnapshot,true);
  assert.equal(legacyStatus.matchesDesired,false);
  assert.equal(legacyStatus.retiresLegacyUsers,true);
  assert.ok(normalizedRules(legacy).includes("match /users/{userId}"));
});
test("cutover needs matching audited release and two separate operator confirmations",()=>{
  const args={classification:legacyStatus,expectedRuleset:liveName,
    confirmation:"DEPLOY_PIANTA_DB_RULES",legacyConfirmation:"RETIRE_LEGACY_USERS_ACCESS"};
  assert.equal(validateDeployGate(args),true);
  assert.throws(()=>validateDeployGate({...args,expectedRuleset:"projects/pianta-db/rulesets/newer"}),/cambiate/);
  assert.throws(()=>validateDeployGate({...args,confirmation:""}),/Conferma/);
  assert.throws(()=>validateDeployGate({...args,legacyConfirmation:""}),/cutover/);
  assert.throws(()=>verifyDesiredRules(legacyStatus),/diverse/);
});
test("subsequent updates can be approved from an exact audited release",()=>{
  const previous=desired.replace("/* update marker */",""); // no mutation to prod
  const next=desired+"\n// future revision";
  const status=classifyRules({live:{rulesetName:liveName,source:previous},desired:next,legacy});
  assert.equal(status.retiresLegacyUsers,false);
  assert.throws(()=>validateDeployGate({
    classification:status,expectedRuleset:liveName,confirmation:"DEPLOY_PIANTA_DB_RULES",
    legacyConfirmation:""
  }),/già allineate/); // only comments differ, deployment must not be redundant
});
test("read only API must use project pianta-db and never include credentials in URL",async()=>{
  const urls=[];
  const fetcher=async (url,opts)=>{
    urls.push(url);
    assert.equal(opts.method,"GET");
    assert.equal(opts.headers.Authorization,"Bearer sample-test-token-123");
    if(url.endsWith(LIVE_RELEASE)) return {ok:true,json:async()=>({rulesetName:liveName})};
    if(url.endsWith(liveName)) return {ok:true,json:async()=>({source:{files:[{name:"firestore.rules",content:legacy}]}})};
    throw Error("Unexpected URL "+url);
  };
  const live=await readLiveRules({fetcher,token:"sample-test-token-123"});
  assert.equal(live.rulesetName,liveName);
  assert.equal(urls.length,2);
  assert.ok(urls.every(x=>x.startsWith("https://firebaserules.googleapis.com/v1/projects/pianta-db/")));
  assert.ok(urls.every(x=>!x.includes("sample-test-token")));
});
test("exact main SHA check requires all three successful status checks",async()=>{
  const sha="a".repeat(40);
  const checkRuns=["Static & unit checks","Firestore Rules Emulator","Responsive browser smoke"].map(name=>({
    name,head_sha:sha,status:"completed",conclusion:"success"
  }));
  const fetcher=async()=>({ok:true,json:async()=>({check_runs:checkRuns})});
  assert.equal(await verifyChecks({token:"github-token",sha,fetcher}),true);
  await assert.rejects(verifyChecks({token:"github-token",sha,fetcher:async()=>({
    ok:true,json:async()=>({check_runs:checkRuns.slice(0,2)})
  })}),/Responsive browser/);
});
test("workflow is manual, isolated to Firestore Rules and needs WIF",async()=>{
  const workflow=await readFile(new URL("../.github/workflows/firebase-firestore-rules.yml",import.meta.url),"utf8");
  const deployConfig=JSON.parse(await readFile(new URL("../firebase.rules-deploy.json",import.meta.url),"utf8"));
  const hostingConfig=JSON.parse(await readFile(new URL("../firebase.json",import.meta.url),"utf8"));
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\bworkflow_run:|\bpush:\s*\n/);
  assert.match(workflow,/environment: firestore-production/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/--only firestore:rules/);
  assert.match(workflow,/--config firebase.rules-deploy.json/);
  assert.doesNotMatch(workflow,/FIREBASE_TOKEN|service_account_key|--force/);
  assert.deepEqual(deployConfig,{firestore:{rules:"firestore.rules"}});
  assert.equal(hostingConfig.firestore,undefined);
});
