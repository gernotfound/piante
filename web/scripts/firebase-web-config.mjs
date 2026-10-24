import { firebaseConfig as manualFirebaseConfig } from "../firebase-config.mjs";

export const FIREBASE_PROJECT_ID = "pianta-db";
export const FIREBASE_SITE_ORIGIN = "https://piante.web.app";
export const FIREBASE_AUTH_DOMAIN = "piante.web.app";

// The reserved Firebase Hosting endpoint can return the default project
// authDomain even when the frontend is served by an additional Hosting site.
// Keep OAuth on the same verified origin as the website.
const ALLOWED_AUTH_DOMAINS = new Set([
  FIREBASE_AUTH_DOMAIN, "pianta-db.firebaseapp.com", "pianta-db.web.app"
]);

export function validateFirebaseWebConfig(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("La configurazione Firebase Web non è valida.");
  }
  const { apiKey, appId, projectId, authDomain } = candidate;
  if (projectId !== FIREBASE_PROJECT_ID) {
    throw new Error("Il progetto Firebase non corrisponde a Piante.");
  }
  if (typeof apiKey !== "string" || !apiKey.trim() ||
      typeof appId !== "string" || !appId.trim()) {
    throw new Error("Firebase Web non contiene API key o App ID.");
  }
  if (typeof authDomain !== "string" || !ALLOWED_AUTH_DOMAINS.has(authDomain)) {
    throw new Error("Dominio Firebase Authentication inatteso.");
  }
  return Object.freeze({
    apiKey: apiKey.trim(),
    appId: appId.trim(),
    projectId: FIREBASE_PROJECT_ID,
    authDomain: FIREBASE_AUTH_DOMAIN
  });
}

/**
 * An explicit, complete config is useful for local emulators; incomplete
 * config is never silently mixed with auto-discovered values.
 *
 * Auto-discovery is allowed only on the actual Piante Hosting origin.
 * Firebase Hosting owns /__/firebase/init.json (not the SPA rewrite).
 * All failures reject; no fallback to another project or a public app.
 */
export async function resolveFirebaseWebConfig({
  origin = globalThis.location?.origin ?? "",
  configured = manualFirebaseConfig,
  fetchConfig = globalThis.fetch
} = {}) {
  const filled = ["apiKey", "appId"].map(key => typeof configured?.[key] === "string" && Boolean(configured[key].trim()));
  if (filled.some(Boolean)) {
    if (!filled.every(Boolean)) throw new Error("Configurazione Firebase Web parziale.");
    return validateFirebaseWebConfig(configured);
  }
  if (origin !== FIREBASE_SITE_ORIGIN) {
    throw new Error("Firebase Web non è configurato in questa anteprima locale.");
  }
  if (typeof fetchConfig !== "function") {
    throw new Error("Impossibile leggere la configurazione Firebase dal sito.");
  }
  const response = await fetchConfig("/__/firebase/init.json", {
    cache: "no-store", credentials: "same-origin", redirect: "error",
    headers: { "Accept": "application/json" }
  });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("Il sito Firebase Hosting non espone una configurazione Web valida.");
  }
  return validateFirebaseWebConfig(await response.json());
}
