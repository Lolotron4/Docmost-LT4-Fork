import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

// LT4-Docs Client (Tauri). Läuft im System-WebView, Port fest für `tauri dev`.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  build: {
    target: "es2021",
    outDir: "dist",
    chunkSizeWarningLimit: 4000,
  },
});
