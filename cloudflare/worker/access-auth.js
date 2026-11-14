// This guard is independent of Access route settings and rejects missing configuration.
// No browser-supplied claim is trusted until the RS256 signature has been verified.
const TOKEN_MAX_LENGTH = 8192;
const CERTS_MAX_LENGTH = 64000;
const CLOCK_SKEW_SECONDS = 30;
const AUDIENCE = /^[a-f0-9]{64}$/i;
const OWNER_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ENCODED = /^[A-Za-z0-9_-]+$/;
const KID = /^[a-zA-Z0-9_-]{1,128}$/;

function issuerFromEnv(raw) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.port || url.pathname !== "/" || url.search || url.hash ||
        !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  if (!ENCODED.test(value) || value.length > TOKEN_MAX_LENGTH) throw new Error("Invalid encoding");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function parseSegment(value) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value)));
}

function validClaims(payload, config, now) {
  return payload && typeof payload === "object" && !Array.isArray(payload) &&
    payload.type === "app" &&
    payload.iss === config.issuer &&
    (payload.aud === config.audience ||
      (Array.isArray(payload.aud) && payload.aud.includes(config.audience))) &&
    payload.sub === config.ownerSub &&
    Number.isSafeInteger(payload.exp) && payload.exp > now &&
    Number.isSafeInteger(payload.iat) && payload.iat <= now + CLOCK_SKEW_SECONDS &&
    payload.exp > payload.iat &&
    (!Object.hasOwn(payload, "nbf") ||
      (Number.isSafeInteger(payload.nbf) && payload.nbf <= now + CLOCK_SKEW_SECONDS));
}

async function fetchSigningKey(config, kid, fetcher) {
  // The origin is derived solely from deployment configuration, never from JWT headers.
  const url = config.issuer + "/cdn-cgi/access/certs";
  const response = await fetcher(url, { redirect: "error" });
  if (!response?.ok) throw new Error("Access certificates unavailable");
  const raw = await response.text();
  if (raw.length > CERTS_MAX_LENGTH) throw new Error("Access certificates too large");
  const jwks = JSON.parse(raw);
  if (!Array.isArray(jwks?.keys)) throw new Error("Invalid Access JWKS");
  const keys = jwks.keys.filter(key =>
    key && key.kid === kid && key.kty === "RSA" && key.alg === "RS256" &&
    key.use === "sig" && typeof key.n === "string" && typeof key.e === "string");
  if (keys.length !== 1) throw new Error("Untrusted signing key");
  return crypto.subtle.importKey("jwk", {
    kty: "RSA", n: keys[0].n, e: keys[0].e, alg: "RS256", ext: true
  }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

export async function verifyAccessOwner(request, env, {
  fetcher = fetch, now = Math.floor(Date.now() / 1000)
} = {}) {
  const issuer = issuerFromEnv(env?.ACCESS_TEAM_DOMAIN);
  const audience = env?.ACCESS_AUD;
  const ownerSub = env?.ACCESS_OWNER_SUB;
  if (!issuer || typeof audience !== "string" || !AUDIENCE.test(audience) ||
      typeof ownerSub !== "string" || !OWNER_ID.test(ownerSub)) return false;

  // Access injects this assertion after authenticating a browser request.
  // Never accept email, unverified headers, or a browser cookie as identity.
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (typeof token !== "string" || !token || token.length > TOKEN_MAX_LENGTH) return false;

  try {
    const segments = token.split(".");
    if (segments.length !== 3) return false;
    const header = parseSegment(segments[0]);
    const payload = parseSegment(segments[1]);
    if (!header || typeof header !== "object" || Array.isArray(header) ||
        header.alg !== "RS256" || !KID.test(header.kid) ||
        Object.hasOwn(header, "crit") ||
        !validClaims(payload, { issuer, audience, ownerSub }, now)) return false;
    const key = await fetchSigningKey({ issuer }, header.kid, fetcher);
    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, decodeBase64Url(segments[2]),
      new TextEncoder().encode(segments[0] + "." + segments[1])
    );
  } catch {
    // Access unreachable, malformed JWT, key rotation or invalid signature: deny.
    return false;
  }
}
