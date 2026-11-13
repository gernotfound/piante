import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./cloudflare/dist/", import.meta.url)),
  publicDir: fileURLToPath(new URL("./cloudflare/public/", import.meta.url)),
  plugins: [cloudflare()]
});
