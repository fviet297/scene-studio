import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The panel is served by scripts/review-server.mjs under /studio. In dev Vite runs on 5173 and
// proxies every route the review server owns, so the app always calls same-origin paths.
const REVIEW = "http://127.0.0.1:9000";
const proxied = [
  "/api",
  "/images",
  "/audio",
  "/characters",
  "/motion-video",
  "/video",
  "/output",
  "/preview.js",
  "/public",
  "/brand-logo.svg",
];

export default defineConfig({
  root: __dirname,
  base: "/studio/",
  plugins: [react()],
  build: { outDir: "../scripts/panel-dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: Object.fromEntries(proxied.map((path) => [path, { target: REVIEW, changeOrigin: true }])),
  },
});
