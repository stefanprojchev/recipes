import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import serviceWorker from "./integrations/service-worker.mjs";
import devMedia from "./integrations/dev-media.mjs";

export default defineConfig({
  site: "https://example.com",
  output: "static",

  i18n: {
    defaultLocale: "mk",
    locales: ["mk", "en"],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  integrations: [sitemap(), serviceWorker(), devMedia()],

  vite: {
    plugins: [
      tailwindcss(),
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        strategy: ["url", "baseLocale"],
      }),
    ],
  },
});
