import test from "node:test";
import assert from "node:assert/strict";
import { verifyAccessOwner } from "../../cloudflare/worker/access-auth.js";

const NOW = 2_000_000_000;
const ISSUER = "https://piantee-test.cloudflareaccess.com";
const AUD = "a".repeat(64);
const OWNER = "7335d417-61da-459d-899c-0a01c76a2f94";
const KID = "synthetic-key-1";

async function fixture() {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const publicKey = { kty: "RSA", n: jwk.n, e: jwk.e, kid: KID, alg: "RS256", use: "sig" };
  const env = { ACCESS_TEAM_DOMAIN: ISSUER, ACCESS_AUD: AUD, ACCESS_OWNER_SUB: OWNER };
  const payload = { iss: ISSUER, aud: [AUD], sub: OWNER, type: "app",
    iat: NOW - 10, nbf: NOW - 10, exp: NOW + 300 };
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
  async function token(claims = {}, headers = {}) {
    const prefix = encode({ alg: "RS256", kid: KID, typ: "JWT", ...headers }) +
      "." + encode({ ...payload, ...claims });
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(prefix)
    );
    return prefix + "." + Buffer.from(signature).toString("base64url");
  }
  const request = jwt => new Request("https://piantee.example.test/api/v1/admin/session", {
    headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}
  });
  let fetchCount = 0;
  const fetcher = async (url, options) => {
    fetchCount++;
    assert.equal(url, ISSUER + "/cdn-cgi/access/certs");
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify({ keys: [publicKey] }), { status: 200 });
  };
  const verify = (jwt, changes = {}) => verifyAccessOwner(request(jwt), env, {
    fetcher, now: NOW, ...changes
  });
  return { token, request, verify, env, fetcher, publicKey, count: () => fetchCount };
}

test("Access: accepts only a correctly signed app JWT for the configured owner", async () => {
  const f = await fixture();
  assert.equal(await f.verify(await f.token()), true);
  assert.equal(f.count(), 1);
});

test("Access: missing policy or assertion is fail-closed, never a cookie-only login", async () => {
  const f = await fixture();
  assert.equal(await f.verify(null), false);
  assert.equal(await verifyAccessOwner(new Request("https://piantee.example.test", {
    headers: { Cookie: "CF_Authorization=forged" }
  }), f.env, { fetcher: f.fetcher, now: NOW }), false);
  assert.equal(await verifyAccessOwner(f.request(await f.token()), {
    ...f.env, ACCESS_OWNER_SUB: undefined
  }, { fetcher: f.fetcher, now: NOW }), false);
  assert.equal(f.count(), 0);
});

test("Access: signature cannot be replaced or silently bypassed", async () => {
  const f = await fixture();
  const signed = await f.token();
  const segments = signed.split(".");
  const claims = JSON.parse(Buffer.from(segments[1], "base64url").toString());
  const changed = Buffer.from(JSON.stringify({ ...claims, country: "IT" })).toString("base64url");
  assert.equal(await f.verify(segments[0] + "." + changed + "." + segments[2]), false);
  assert.equal(await f.verify("forged"), false);
  assert.equal(await f.verify(await f.token({}, { alg: "none" })), false);
  assert.equal(await f.verify(await f.token({}, { crit: ["b64"] })), false);
  assert.equal(f.count(), 1);
});

test("Access: wrong audience, issuer, subject, token class and expired dates are rejected", async () => {
  const f = await fixture();
  const bad = [
    { aud: ["b".repeat(64)] }, { iss: "https://other.cloudflareaccess.com" },
    { sub: "7335d417-61da-459d-899c-0a01c76a2f95" },
    { sub: "", common_name: "service-token.access" }, { type: "org" },
    { exp: NOW }, { iat: NOW + 500 }, { nbf: NOW + 500 },
    { exp: NOW - 1000 }, { exp: "tomorrow" }
  ];
  for (const changes of bad) assert.equal(await f.verify(await f.token(changes)), false);
  assert.equal(f.count(), 0);
});

test("Access: issuer comes only from the pinned Cloudflare domain, never from JWT input", async () => {
  const f = await fixture();
  const jwt = await f.token();
  for (const domain of [
    "https://example.org", "http://piantee-test.cloudflareaccess.com",
    "https://piantee-test.cloudflareaccess.com.evil.invalid",
    "https://piantee-test.cloudflareaccess.com@evil.invalid",
    "https://piantee-test.cloudflareaccess.com/certs",
    "https://piantee-test.cloudflareaccess.com:8443"
  ]) {
    assert.equal(await verifyAccessOwner(f.request(jwt), {
      ...f.env, ACCESS_TEAM_DOMAIN: domain
    }, { fetcher: f.fetcher, now: NOW }), false);
  }
  assert.equal(f.count(), 0);
});

test("Access: unknown key and JWKS/network failures deny access", async () => {
  const f = await fixture();
  const jwt = await f.token();
  assert.equal(await f.verify(await f.token({}, { kid: "untrusted-kid" })), false);
  assert.equal(await f.verify(jwt, {
    fetcher: async () => new Response("unavailable", { status: 503 })
  }), false);
  assert.equal(await f.verify(jwt, {
    fetcher: async () => new Response("{not-json", { status: 200 })
  }), false);
  assert.equal(await f.verify(jwt, { fetcher: async () => {
    throw new Error("network unavailable");
  } }), false);
});
