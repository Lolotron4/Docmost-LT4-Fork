// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/** Fehler ohne Serverantwort = keine Verbindung (nicht: Seite gelöscht/kein Zugriff). */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  if (error.response) return false;
  return (
    error.code === "ERR_NETWORK" ||
    error.message === "Network Error" ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  );
}
