// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import compress from "astro-compress";
import sitemap from "@astrojs/sitemap";
import { SITE_NAME } from "./src/lib";

// https://astro.build/config
export default defineConfig({
  site: `https://${SITE_NAME}/`,
  output: "static",
  integrations: [
    react(),
    // TODO: see what compress does
    compress({
      HTML: true,
      CSS: true,
      SVG: true,
      JavaScript: true,
    }),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    format: "file",
    concurrency: 40,
  },
});
