import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../cloudflare/worker/index.js";
import { handleKindeAuth, verifyKindeOwner } from "../../cloudflare/worker/kinde-auth.js";

const SITE = "https://piantee.example.test";
const ISSUER = "https://piantee-tests.kinde.com";
const OWNER = "kp_piantee_test_owner_1";
const CLIENT = "piantee-only-client";
const SECRET = Buffer.alloc(32, 21).toString("base64url");

async function fixture(t) {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const env = { KINDE_ISSUER: ISSUER, KINDE_SITE_ORIGIN: SITE,
    KINDE_CLIENT_ID: CLIENT, KINDE_CLIENT_SECRET: "synthetic-client-secret",
    KINDE_OWNER_SUB: OWNER, KINDE_SESSION_KEY: SECRET };
  let authorizeUrl, claims = {}, jwksBroken = false, tokenBroken = false;
  const originalFetch = globalThis.fetch;
  let tokenRequests = 0, jwksRequests = 0;
  const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  async function signedId() {
    const now = Math.floor(Date.now() / 1000);
    const header = b64({ alg: "RS256", typ: "JWT", kid: "piantee-test-key" });
    const payload = b64({ iss: ISSUER, aud: CLIENT, sub: OWNER,
      iat: now - 2, exp: now + 600, email_verified: true,
      nonce: authorizeUrl.searchParams.get("nonce"), ...claims });
    const value = header + "." + payload;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey,
      new TextEncoder().encode(value));
    return value + "." + Buffer.from(signature).toString("base64url");
  }
  globalThis.fetch = async (target, options = {}) => {
    if (target === ISSUER + "/oauth2/token") {
      tokenRequests++;
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      const data = new URLSearchParams(options.body);
      assert.equal(data.get("client_id"), CLIENT);
      assert.equal(data.get("client_secret"), env.KINDE_CLIENT_SECRET);
      assert.equal(data.get("redirect_uri"), SITE + "/api/auth/callback");
      const pkce = Buffer.from(await crypto.subtle.digest("SHA-256",
        new TextEncoder().encode(data.get("code_verifier")))).toString("base64url");
      assert.equal(pkce, authorizeUrl.searchParams.get("code_challenge"));
      return tokenBroken ? Response.json({ error: "invalid_grant" }, { status: 400 }) :
        Response.json({ id_token: await signedId() });
    }
    if (target === ISSUER + "/.well-known/jwks") {
      jwksRequests++;
      assert.equal(options.redirect, "error");
      return jwksBroken ? new Response("offline", { status: 503 }) :
        Response.json({ keys: [{ kty: "RSA", n: jwk.n, e: jwk.e, kid: "piantee-test-key",
          alg: "RS256", use: "sig" }] });
    }
    throw Error("Unexpected request to " + target);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const req = (path, init = {}) => new Request(SITE + path, init);
  const dispatch = (path, init = {}, settings = env) => worker.fetch(req(path, init), settings);
  async function start(settings = env) {
    const login = await dispatch("/api/auth/login", {}, settings);
    assert.equal(login.status, 303);
    authorizeUrl = new URL(login.headers.get("Location"));
    assert.equal(authorizeUrl.origin, ISSUER);
    assert.equal(authorizeUrl.pathname, "/oauth2/auth");
    assert.equal(authorizeUrl.searchParams.get("prompt"), "login");
    assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorizeUrl.searchParams.get("client_id"), CLIENT);
    const flowCookie = login.headers.get("Set-Cookie");
    assert.match(flowCookie, /HttpOnly; Secure; SameSite=Lax/);
    return flowCookie.split(";")[0];
  }
  async function finish(flowCookie, state = authorizeUrl.searchParams.get("state")) {
    return dispatch("/api/auth/callback?code=valid_abc.123&state=" + encodeURIComponent(state),
      { headers: { Cookie: flowCookie } });
  }
  return { env, req, dispatch, start, finish,
    setClaims: v => { claims = v; }, setBadJwks: v => { jwksBroken = v; },
    setBadToken: v => { tokenBroken = v; },
    count: () => ({ tokenRequests, jwksRequests }) };
}

test("Kinde: authorization code + PKCE + nonce + owner Kinde verificati", async t => {
  const f = await fixture(t);
  assert.equal((await f.dispatch("/api/v1/admin/session")).status, 403);
  const pending = await f.start();
  const callback = await f.finish(pending);
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get("Location"), SITE + "/admin.html");
  const issued = callback.headers.getSetCookie();
  const session = issued.find(value => value.startsWith("__Host-piantee_session=")).split(";")[0];
  assert.ok(issued.some(value => value.startsWith("__Host-piantee_flow=;")));
  assert.match(session, /__Host-piantee_session=/);
  assert.equal((await f.dispatch("/api/v1/admin/session", { headers: { Cookie: session } })).status, 200);
  assert.equal((await f.dispatch("/api/v1/admin/session", {
    headers: { "Cf-Access-Jwt-Assertion": "forged", Authorization: "Bearer forged" }
  })).status, 403);
  assert.deepEqual(f.count(), { tokenRequests: 1, jwksRequests: 1 });
  const offOrigin = await f.dispatch("/api/auth/logout", { method: "POST",
    headers: { Origin: "https://other.example.test", Cookie: session } });
  assert.equal(offOrigin.status, 403);
  const logout = await f.dispatch("/api/auth/logout", { method: "POST",
    headers: { Origin: SITE, "Sec-Fetch-Site": "same-origin", Cookie: session } });
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).logoutUrl, ISSUER + "/logout?redirect=" +
    encodeURIComponent(SITE + "/"));
  assert.ok(logout.headers.getSetCookie().some(v => v.startsWith("__Host-piantee_session=;")));
});

test("Kinde: sub diverso, email non verificata e nonce errato non creano sessioni", async t => {
  const f = await fixture(t);
  for (const wrong of [
    { sub: "kp_different_owner_2" }, { email_verified: false },
    { nonce: "forged-nonce" }, { aud: "another-application" },
    { iss: "https://another-tenant.kinde.com" }, { exp: 1 }
  ]) {
    const pending = await f.start();
    f.setClaims(wrong);
    const callback = await f.finish(pending);
    assert.equal(callback.status, 403);
    assert.equal(callback.headers.get("Set-Cookie")?.includes("__Host-piantee_session="), false);
    assert.equal((await f.dispatch("/api/v1/admin/session")).status, 403);
  }
  f.setClaims({});
  f.setBadJwks(true);
  assert.equal((await f.finish(await f.start())).status, 403);
  f.setBadJwks(false);
  f.setBadToken(true);
  assert.equal((await f.finish(await f.start())).status, 403);
});

test("Kinde: state mancante o manipolato, cookie falso, origine alternativa e config assente negati", async t => {
  const f = await fixture(t);
  const pending = await f.start();
  assert.equal((await f.finish(pending, "wrong-state")).status, 403);
  assert.equal((await f.finish(pending.replace(/.$/, "x"))).status, 403);
  assert.equal((await f.dispatch("/api/auth/callback?code=abc")).status, 403);
  assert.equal((await f.dispatch("/api/auth/login", { method: "POST" })).status, 405);
  assert.equal((await f.dispatch("/api/auth/logout", { method: "GET" })).status, 405);
  assert.equal((await f.dispatch("/api/auth/login?q=other")).status, 400);
  assert.equal((await f.dispatch("/api/auth/login", {}, {})).status, 503);
  assert.equal((await f.dispatch("/api/auth/login", {}, { ...f.env,
    KINDE_ISSUER: "https://other.kinde.com.evil.test" })).status, 503);
  const foreign = new Request("https://preview.example.test/api/auth/login");
  assert.equal((await worker.fetch(foreign, f.env)).status, 403);
  const forged = new Request(SITE + "/api/v1/admin/session", {
    headers: { Cookie: "__Host-piantee_session=forged" }
  });
  assert.equal(await verifyKindeOwner(forged, f.env), false);
  assert.equal((await handleKindeAuth(f.req("/api/auth/callback?code=a&state=s"), f.env, {
    now: Math.floor(Date.now() / 1000) + 301
  })).status, 403);
});
