// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Dünne Hülle um die Rust-Befehle (src-tauri/src/lib.rs).
import { invoke } from "@tauri-apps/api/core";
import type { LockKind, VaultStatus } from "./types";

export const vault = {
  status: () => invoke<VaultStatus>("vault_status"),
  create: (kind: LockKind, secret?: string) =>
    invoke<VaultStatus>("vault_create", { kind, secret: secret ?? null }),
  unlock: (secret?: string) =>
    invoke<VaultStatus>("vault_unlock", { secret: secret ?? null }),
  lock: () => invoke<VaultStatus>("vault_lock"),
  changeLock: (kind: LockKind, secret?: string) =>
    invoke<VaultStatus>("vault_change_lock", { kind, secret: secret ?? null }),
  reset: () => invoke<VaultStatus>("vault_reset"),
};

export const data = {
  read: (name: string) => invoke<string | null>("data_read", { name }),
  write: (name: string, content: string) =>
    invoke<void>("data_write", { name, content }),
  remove: (name: string) => invoke<void>("data_delete", { name }),
};

export const files = {
  write: (id: string, base64: string) => invoke<void>("file_write", { id, base64 }),
  read: (id: string) => invoke<string | null>("file_read", { id }),
  remove: (id: string) => invoke<void>("file_delete", { id }),
};

export const exportWrite = (path: string, base64: string) =>
  invoke<void>("export_write", { path, base64 });

export const importRead = (path: string) => invoke<string>("import_read", { path });

export const openServerWindow = (url: string, title: string) =>
  invoke<void>("open_server_window", { url, title });

/** Druckdialog des Fensters öffnen (PDF über "Als PDF speichern"). */
export const printPage = () => invoke<void>("print_page");

export function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as any).message);
  }
  return "Unbekannter Fehler";
}

// ---- Base64-Helfer ----

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
