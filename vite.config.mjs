import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import cfConfig from "./cloudflare.config.ts";

export default defineConfig({
  root: fileURLToPath(new URL("./cloudflare/dist/", import.meta.url)),
  publicDir: fileURLToPath(new URL("./cloudflare/public/", import.meta.url)),
  plugins: [cloudflare({ config: cfConfig.worker })]
});
