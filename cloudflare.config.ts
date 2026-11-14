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
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_AUD: bindings.secret(),
      ACCESS_OWNER_SUB: bindings.secret()
    }
  }
});
