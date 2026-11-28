import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

const root = import.meta.dirname;

// Die Datenbank-Oberfläche kommt aus apps/client (lt4/base). Statt mit dem Server spricht
// sie im Client mit dem lokalen Tresor: deren base-service wird hier umgeleitet.
function localBaseService(): Plugin {
  const target = path.resolve(root, "src/base/base-service.ts");
  return {
    name: "lt4-local-base-service",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      const norm = importer.replace(/\\/g, "/");
      if (norm.includes("/apps/client/src/lt4/base/") && /(^|\/)services\/base-service(\.ts)?$/.test(source)) {
        return target;
      }
      return null;
    },
  };
}

// LT4-Docs Client (Tauri). Läuft im System-WebView, Port fest für `tauri dev`.
export default defineConfig({
  plugins: [localBaseService(), react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  resolve: {
    alias: { "@": path.resolve(root, "./src") },
    // Code aus apps/client soll dieselben Bibliotheken nutzen (ein React, ein Mantine,
    // ein react-query, ein i18next), sonst fehlen Kontexte.
    dedupe: [
      "react",
      "react-dom",
      "@mantine/core",
      "@mantine/hooks",
      "@mantine/dates",
      "@mantine/modals",
      "@mantine/notifications",
      "@tabler/icons-react",
      "@tanstack/react-query",
      "react-i18next",
      "i18next",
      "dayjs",
      "katex",
      "@tiptap/core",
      "@tiptap/react",
      "@tiptap/pm",
    ],
  },
  build: {
    target: "es2021",
    outDir: "dist",
    chunkSizeWarningLimit: 4000,
  },
});
