// The Worker, not client state or a proxy header, authorizes the unique Kinde subject.
const FLOW = "__Host-piantee_flow", SESSION = "__Host-piantee_session";
const MAX_FLOW = 300, MAX_SESSION = 3600;
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
function decode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error("encoding");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}
const random = (n = 32) => encode(crypto.getRandomValues(new Uint8Array(n)));
function origin(value, kinde = false) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port ||
        u.pathname !== "/" || u.search || u.hash ||
        (kinde && !/^[a-z0-9-]+\.kinde\.com$/i.test(u.hostname))) return null;
    return u.origin;
  } catch { return null; }
}
function config(env) {
  const issuer = origin(env?.KINDE_ISSUER, true), site = origin(env?.KINDE_SITE_ORIGIN);
  const clientId = env?.KINDE_CLIENT_ID, clientSecret = env?.KINDE_CLIENT_SECRET;
  const owner = env?.KINDE_OWNER_SUB, secret = env?.KINDE_SESSION_KEY;
  if (!issuer || !site || typeof clientId !== "string" ||
      !/^[A-Za-z0-9_-]{8,200}$/.test(clientId) ||
      typeof clientSecret !== "string" || clientSecret.length < 12 ||
      typeof owner !== "string" || !/^kp_[A-Za-z0-9_-]{6,200}$/.test(owner) ||
      typeof secret !== "string" || secret.length > 128) return null;
  try {
    const bytes = decode(secret);
    return bytes.length === 32 ? { issuer, site, clientId, clientSecret, owner, bytes } : null;
  } catch { return null; }
}
function readCookie(request, key) {
  const matched = (request.headers.get("Cookie") || "").split(";")
    .map(x => x.trim()).filter(x => x.startsWith(key + "="));
  return matched.length === 1 ? matched[0].slice(key.length + 1) : null;
}
const cookie = (key, val, seconds) =>
  key + "=" + val + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + seconds;
async function mac(config) {
  return crypto.subtle.importKey("raw", config.bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function seal(config, payload) {
  const value = encode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await mac(config), encoder.encode(value));
  return value + "." + encode(new Uint8Array(signature));
}
async function open(config, raw) {
  if (typeof raw !== "string" || raw.length > 1400) return null;
  try {
    const parts = raw.split(".");
    if (parts.length !== 2 || !(await crypto.subtle.verify("HMAC",
      await mac(config), decode(parts[1]), encoder.encode(parts[0])))) return null;
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decode(parts[0])));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
const json = (code, status) => new Response(JSON.stringify({ error: { code } }), {
  status, headers: { "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff" }
});
function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}
function validClaims(c, cfg, nonce, now) {
  const audiences = Array.isArray(c?.aud) ? c.aud : [c?.aud];
  return c && typeof c === "object" && !Array.isArray(c) &&
    c.iss === cfg.issuer && c.sub === cfg.owner && c.nonce === nonce &&
    // Kinde ID tokens normally use the issuer URL as aud and the app ID as azp.
    // email_verified is not a guaranteed Kinde claim; reject an explicit false.
    c.azp === cfg.clientId &&
    (audiences.includes(cfg.issuer) || audiences.includes(cfg.clientId)) &&
    c.email_verified !== false &&
    Number.isSafeInteger(c.iat) && c.iat <= now + 30 &&
    Number.isSafeInteger(c.exp) && c.exp > now &&
    (!Object.hasOwn(c, "nbf") || (Number.isSafeInteger(c.nbf) && c.nbf <= now + 30));
}
async function verifyId(raw, cfg, nonce, now, fetcher) {
  if (typeof raw !== "string" || raw.length > 12000) return null;
  try {
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const parse = s => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decode(s)));
    const hdr = parse(parts[0]), claims = parse(parts[1]);
    if (!hdr || hdr.alg !== "RS256" || typeof hdr.kid !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(hdr.kid) || Object.hasOwn(hdr, "crit") ||
        !validClaims(claims, cfg, nonce, now)) return null;
    const response = await fetcher(cfg.issuer + "/.well-known/jwks", { redirect: "error" });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 64000) return null;
    const keys = JSON.parse(text)?.keys;
    if (!Array.isArray(keys)) return null;
    const matches = keys.filter(k => k.kid === hdr.kid && k.kty === "RSA" &&
      k.alg === "RS256" && k.use === "sig" && typeof k.n === "string" && typeof k.e === "string");
    if (matches.length !== 1) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA",
      n: matches[0].n, e: matches[0].e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5",
      key, decode(parts[2]), encoder.encode(parts[0] + "." + parts[1]));
    return valid ? claims : null;
  } catch { return null; }
}
export async function verifyKindeOwner(request, env, now = Math.floor(Date.now() / 1000)) {
  const cfg = config(env);
  if (!cfg || new URL(request.url).origin !== cfg.site) return false;
  const session = await open(cfg, readCookie(request, SESSION));
  return !!session && session.purpose === "session" && session.sub === cfg.owner &&
    Number.isSafeInteger(session.iat) && session.iat <= now &&
    Number.isSafeInteger(session.exp) && session.exp > now &&
    session.exp - session.iat <= MAX_SESSION;
}
export async function handleKindeAuth(request, env, {
  fetcher = fetch, now = Math.floor(Date.now() / 1000)
} = {}) {
  const url = new URL(request.url);
  if (!["/api/auth/login", "/api/auth/callback", "/api/auth/logout"].includes(url.pathname)) return null;
  const cfg = config(env);
  if (!cfg) return json("authentication_unavailable", 503);
  if (url.origin !== cfg.site) return json("forbidden", 403);
  if (url.pathname === "/api/auth/login") {
    if (request.method !== "GET") return json("method_not_allowed", 405);
    if (url.search) return json("invalid_request", 400);
    const state = random(), nonce = random(), verifier = random();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
    const login = new URL(cfg.issuer + "/oauth2/auth");
    login.search = new URLSearchParams({ response_type: "code", client_id: cfg.clientId,
      redirect_uri: cfg.site + "/api/auth/callback", scope: "openid email",
      state, nonce, prompt: "login", code_challenge: encode(new Uint8Array(digest)),
      code_challenge_method: "S256" }).toString();
    const flow = await seal(cfg, { purpose: "flow", state, nonce, verifier, exp: now + MAX_FLOW });
    return redirect(login.href, [cookie(FLOW, flow, MAX_FLOW)]);
  }
  if (url.pathname === "/api/auth/logout") {
    if (request.method !== "POST") return json("method_not_allowed", 405);
    if (url.search || request.headers.get("Origin") !== cfg.site ||
        ![null, "same-origin"].includes(request.headers.get("Sec-Fetch-Site"))) {
      return json("forbidden", 403);
    }
    const location = new URL(cfg.issuer + "/logout");
    location.searchParams.set("redirect", cfg.site + "/");
    const response = new Response(JSON.stringify({ logoutUrl: location.href }), {
      headers: { "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0" }
    });
    response.headers.append("Set-Cookie", cookie(SESSION, "", 0));
    response.headers.append("Set-Cookie", cookie(FLOW, "", 0));
    return response;
  }
  if (request.method !== "GET") return json("method_not_allowed", 405);
  const flow = await open(cfg, readCookie(request, FLOW));
  const invalid = () => {
    const response = json("authentication_failed", 403);
    response.headers.append("Set-Cookie", cookie(FLOW, "", 0));
    return response;
  };
  if (!flow || flow.purpose !== "flow" || !Number.isSafeInteger(flow.exp) ||
      flow.exp <= now || flow.exp > now + MAX_FLOW ||
      typeof flow.nonce !== "string" || typeof flow.verifier !== "string" ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.getAll("code").length !== 1 ||
      url.searchParams.get("state") !== flow.state) return invalid();
  const code = url.searchParams.get("code");
  if (!/^[A-Za-z0-9._~-]{1,2048}$/.test(code)) return invalid();
  try {
    const response = await fetcher(cfg.issuer + "/oauth2/token", {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code",
        client_id: cfg.clientId, client_secret: cfg.clientSecret, code,
        code_verifier: flow.verifier,
        redirect_uri: cfg.site + "/api/auth/callback" }).toString()
    });
    if (!response.ok) return invalid();
    const body = await response.text();
    if (body.length > 32000) return invalid();
    const claims = await verifyId(JSON.parse(body).id_token, cfg, flow.nonce, now, fetcher);
    if (!claims) return invalid();
    const exp = Math.min(claims.exp, now + MAX_SESSION);
    const session = await seal(cfg, { purpose: "session", sub: cfg.owner,
      iat: now, exp, id: random(16) });
    return redirect(cfg.site + "/admin.html", [
      cookie(FLOW, "", 0), cookie(SESSION, session, exp - now)
    ]);
  } catch { return invalid(); }
}
