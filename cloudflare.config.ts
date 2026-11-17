import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "piantee",
    entrypoint: "./cloudflare/worker/index.js",
    compatibilityDate: "2026-08-06",
    assets: {
      runWorkerFirst: ["/api", "/api/*"],
      notFoundHandling: "none"
    },
    env: {
      DB: bindings.d1({ name: "piantee-db" }),
      KINDE_ISSUER: bindings.secret(),
      KINDE_SITE_ORIGIN: bindings.secret(),
      KINDE_CLIENT_ID: bindings.secret(),
      KINDE_CLIENT_SECRET: bindings.secret(),
      KINDE_OWNER_SUB: bindings.secret(),
      KINDE_SESSION_KEY: bindings.secret()
    }
  }
});
