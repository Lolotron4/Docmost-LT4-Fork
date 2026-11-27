// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { LT4_VERSION } from "@/lt4/version";

/**
 * Meldet den Service Worker an (nur im gebauten Client, nicht im Vite-Dev-Server).
 * Die Version im Dateinamen sorgt dafür, dass nach einem Update ein neuer Worker
 * installiert wird und alte App-Dateien aus dem Speicher fliegen.
 */
export function registerLt4ServiceWorker() {
  if (import.meta.env.DEV) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `/lt4-sw.js?v=${encodeURIComponent(LT4_VERSION)}`,
        { scope: "/" },
      );
      await navigator.serviceWorker.ready;
      // Alles, was die Seite schon geladen hat (inkl. nachgeladener Teile), mitspeichern.
      const sendLoaded = () => {
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => {
            try {
              const p = new URL(u).pathname;
              return new URL(u).origin === location.origin &&
                (p.startsWith("/assets/") || p.startsWith("/locales/") || p.startsWith("/icons/"));
            } catch {
              return false;
            }
          });
        (registration.active ?? navigator.serviceWorker.controller)?.postMessage({
          type: "lt4-cache-urls",
          urls,
        });
      };
      sendLoaded();
      // Nach dem Vorladen der übrigen Bereiche (App.tsx nach 3 s) noch einmal.
      setTimeout(sendLoaded, 15000);
    } catch {
      // Ohne Service Worker läuft die App ganz normal weiter.
    }
  });
}
