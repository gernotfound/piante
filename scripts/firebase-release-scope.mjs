import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A Cloudflare migration commit must not cause the legacy main -> Rules ->
// Hosting workflow_run chain to release unrelated code to Firebase.
const FIREBASE_INPUT = /^(?:src\/|styles\/|index\.html$|favicon(?:[.-]|$)|social-preview(?:[.-]|$)|firestore\.rules$|firebase\.json$|\.firebaserc$|scripts\/reconcile-firestore-rules\.mjs$)/;
const CLOUDFLARE_INPUT = /^(?:cloudflare\/|workers?\/|wrangler(?:[./]|$)|\.dev\.vars|\.github\/workflows\/cloudflare)/;

export function shouldPublishFirebase(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.some(path => typeof path !== "string" || !path.trim())) {
    throw new TypeError("Elenco dei file modificati non valido.");
  }
  return changedPaths.some(path => FIREBASE_INPUT.test(path)) &&
    !changedPaths.some(path => CLOUDFLARE_INPUT.test(path));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT non disponibile: rilascio Firebase bloccato.");
  // Both workflow_run jobs inspect the exact commit they checked out.
  // An unavailable parent or shallow checkout fails closed instead of deploying.
  const changed = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], {
    encoding: "utf8"
  }).trim().split("\n").filter(Boolean);
  const publish = shouldPublishFirebase(changed);
  appendFileSync(output, `publish=${publish}\n`);
  console.log(`Firebase release: ${publish ? "legacy changes detected" : "skipped for non-legacy commit"}`);
}
