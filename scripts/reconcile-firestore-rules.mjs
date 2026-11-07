import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIREBASE_PROJECT = "piante-a617e";
const RELEASE_NAME = `projects/${FIREBASE_PROJECT}/releases/cloud.firestore`;
const API_ROOT = "https://firebaserules.googleapis.com/v1/";

// Firestore Rules may be saved through the console with different whitespace/comments.
// Compare lexical tokens, preserving quoted strings and every executable symbol.
export function tokenizeRules(source) {
  if (typeof source !== "string") throw new Error("Rules source must be text");
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i + 2);
      if (i === -1) break;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) throw new Error("Unterminated block comment in Rules");
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const start = i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i++] === ch) { closed = true; break; }
      }
      if (!closed) throw new Error("Unterminated string in Rules");
      tokens.push(source.slice(start, i));
      continue;
    }
    if (/[A-Za-z_$0-9]/.test(ch)) {
      const start = i++;
      while (i < source.length && /[A-Za-z_$0-9]/.test(source[i])) i++;
      tokens.push(source.slice(start, i));
      continue;
    }
    tokens.push(ch);
    i++;
  }
  return tokens;
}

export function rulesEquivalent(a, b) {
  return JSON.stringify(tokenizeRules(a)) === JSON.stringify(tokenizeRules(b));
}

export function decideReconciliation(live, previous, desired) {
  if (rulesEquivalent(live, desired)) return "unchanged";
  if (rulesEquivalent(live, previous)) return "deploy";
  throw new Error("Live Firestore Rules differ from both desired and previous main: refusing overwrite");
}

export function extractRulesSource(ruleset) {
  const files = ruleset?.source?.files;
  if (!Array.isArray(files) || files.length !== 1 ||
      typeof files[0]?.content !== "string" || !files[0].content.trim()) {
    throw new Error("Unexpected Firebase Ruleset file structure; refusing to modify release");
  }
  return files[0].content;
}

export async function reconcileRules({ desired, previous, request, mode = "reconcile" }) {
  const release = await request("GET", RELEASE_NAME);
  if (release?.name !== RELEASE_NAME || !/^projects\/piante-a617e\/rulesets\/[\w-]+$/.test(release.rulesetName ?? "")) {
    throw new Error("Unexpected Firestore release; only (default) is authorized");
  }
  const existing = await request("GET", release.rulesetName);
  const liveSource = extractRulesSource(existing);

  if (mode === "verify") {
    if (!rulesEquivalent(liveSource, desired)) throw new Error("Live Firestore Rules do not match candidate");
    return { changed: false, rulesetName: release.rulesetName };
  }
  if (mode !== "reconcile") throw new Error("Unsupported mode");
  const decision = decideReconciliation(liveSource, previous, desired);
  if (decision === "unchanged") return { changed: false, rulesetName: release.rulesetName };

  const created = await request("POST", `projects/${FIREBASE_PROJECT}/rulesets`, {
    source: { files: [{ name: "firestore.rules", content: desired }] }
  });
  if (!/^projects\/piante-a617e\/rulesets\/[\w-]+$/.test(created?.name ?? "")) {
    throw new Error("Firebase returned an invalid created Ruleset name");
  }

  // Prevent accidental overwriting of a console update made during this release.
  const again = await request("GET", RELEASE_NAME);
  if (again?.rulesetName !== release.rulesetName) {
    throw new Error("Firestore Rules release changed concurrently; refusing to publish");
  }

  await request("PATCH", RELEASE_NAME, {
    release: { name: RELEASE_NAME, rulesetName: created.name },
    updateMask: "rulesetName"
  });

  const verified = await request("GET", RELEASE_NAME);
  if (verified?.rulesetName !== created.name) {
    throw new Error("Firestore release did not point to the published Ruleset");
  }
  const ruleset = await request("GET", created.name);
  if (!rulesEquivalent(extractRulesSource(ruleset), desired)) {
    throw new Error("Published Ruleset source does not match the GitHub candidate");
  }
  return { changed: true, rulesetName: created.name };
}

async function main() {
  const mode = process.argv[2] || "reconcile";
  if (!["reconcile", "verify"].includes(mode)) throw new Error("Invalid operation");
  const token = process.env.GCP_ACCESS_TOKEN;
  if (!token) throw new Error("A short-lived Workload Identity access token is required");
  const desired = readFileSync("firestore.rules", "utf8");
  const previous = mode === "reconcile"
    ? execFileSync("git", ["show", "HEAD^:firestore.rules"], { encoding: "utf8" })
    : desired;

  const request = async (method, resource, body) => {
    const response = await fetch(API_ROOT + resource, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Firebase Rules API ${method} ${resource} returned HTTP ${response.status}`);
    return response.json();
  };

  const result = await reconcileRules({ desired, previous, request, mode });
  console.log(`Firestore Rules ${mode}: ${result.changed ? "release updated" : "verified/no change"}`);
  if (process.env.GITHUB_OUTPUT && mode === "reconcile") {
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
