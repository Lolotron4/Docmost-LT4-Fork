// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Lädt verschlüsselte Anhänge über Rust und hält Objekt-URLs im Speicher.
import { base64ToBytes, files } from "../lib/native";

const cache = new Map<string, Promise<string | null>>();

export function attachmentUrl(id: string, mimeType = "application/octet-stream") {
  if (!cache.has(id)) {
    cache.set(
      id,
      files.read(id).then((b64) => {
        if (!b64) return null;
        const blob = new Blob([base64ToBytes(b64) as BlobPart], { type: mimeType });
        return URL.createObjectURL(blob);
      }),
    );
  }
  return cache.get(id)!;
}

/** Beim Sperren alle entschlüsselten Bilder aus dem Speicher werfen. */
export function clearAttachmentCache() {
  for (const p of cache.values()) {
    p.then((u) => u && URL.revokeObjectURL(u)).catch(() => undefined);
  }
  cache.clear();
}
