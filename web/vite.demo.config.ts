// Builds the clickable preview (npm run build:demo): the site plus the API running in the page.
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  base: "./",
  plugins: [react()],
  // Escape non-ASCII characters so the bundle survives any text re-encoding.
  esbuild: { charset: "ascii" },
  resolve: {
    alias: { "@anthropic-ai/sdk": fileURLToPath(new URL("./demo/anthropic-stub.ts", import.meta.url)) },
  },
  define: {
    "import.meta.env.VITE_DEV_AUTH": JSON.stringify("1"),
    "import.meta.env.VITE_DEMO": JSON.stringify("1"),
    "import.meta.env.VITE_API_URL": JSON.stringify("https://preview.cotsi.local/api"),
  },
  build: { outDir: "../dist-demo", emptyOutDir: true, sourcemap: false },
});
