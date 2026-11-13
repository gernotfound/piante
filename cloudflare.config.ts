import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./cloudflare/worker/index.js" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "piantee",
    entrypoint,
    compatibilityDate: "2026-08-06",
    assets: {
      runWorkerFirst: ["/api", "/api/*"],
      notFoundHandling: "none"
    },
    env: { DB: bindings.d1({ name: "piantee-db" }) }
  }
});
