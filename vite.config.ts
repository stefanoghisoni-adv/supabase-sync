import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    remix({
      // I test accanto alle route non sono route: senza escluderli, Remix li
      // compila come route module e il build client fallisce (importano
      // `loader`, che nel bundle client viene rimosso perche' server-only).
      ignoredRouteFiles: ["**/*.css", "**/*.test.{ts,tsx}"],
    }),
  ],
});
