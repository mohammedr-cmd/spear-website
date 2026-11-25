import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API's address is a build setting (Cloudflare Pages: SPEAR_API_URL). In development the
// app calls /api, which Vite forwards to the API on this PC (127.0.0.1:8787), so cookies stay
// same-origin over plain http.
const apiUrl = process.env.SPEAR_API_URL ?? "https://analytics-api.rumh.co";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __API_URL__: JSON.stringify(command === "serve" ? "/api" : apiUrl),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: { outDir: "dist", sourcemap: false },
}));
