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
    // Windows' file events are missed after some edits, leaving stale modules in the dev app;
    // polling sees every change
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api/, ""),
        // the API not running answers as the tunnel does (502), so development shows the same
        // "Spear is offline" screen as the live site
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            const r = res as any; // a Node ServerResponse
            if (!r.headersSent) r.writeHead(502, { "Content-Type": "text/plain" });
            r.end("Spear API not reachable");
          });
        },
      },
    },
  },
  build: { outDir: "dist", sourcemap: false },
}));
