// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Lokales Notizbuch: Zustand im Speicher, verschlüsselt gespeichert über Rust.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { bytesToBase64, data, files } from "./native";
import {
  emptyDoc,
  emptyState,
  type AttachmentMeta,
  type NotebookState,
  type PageMeta,
  type PmDoc,
  type ServerEntry,
  type Space,
} from "./types";
import { localAttachmentSrc, safeFileName } from "./lt4docs";

export const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const pageKey = (id: string) => `page-${id}`;

/** Alle Nachkommen einer Seite (ohne die Seite selbst). */
export function descendants(pages: PageMeta[], id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of pages) {
      if (p.parentId === cur) {
        out.push(p.id);
        stack.push(p.id);
      }
    }
  }
  return out;
}

export function childrenOf(pages: PageMeta[], spaceId: string, parentId: string | null) {
  return pages
    .filter((p) => p.spaceId === spaceId && p.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
}

export async function loadDoc(pageId: string): Promise<PmDoc> {
  const raw = await data.read(pageKey(pageId));
  if (!raw) return emptyDoc();
  try {
    const json = JSON.parse(raw);
    return json?.type === "doc" ? json : emptyDoc();
  } catch {
    return emptyDoc();
  }
}

export const saveDoc = (pageId: string, doc: PmDoc) =>
  data.write(pageKey(pageId), JSON.stringify(doc));

interface StoreApi {
  state: NotebookState;
  update: (fn: (s: NotebookState) => NotebookState) => void;
  createSpace: (name: string) => Space;
  renameSpace: (id: string, name: string) => void;
  deleteSpace: (id: string) => Promise<void>;
  createPage: (spaceId: string, parentId: string | null, title?: string) => PageMeta;
  updatePage: (id: string, patch: Partial<PageMeta>) => void;
  movePage: (id: string, parentId: string | null) => void;
  deletePage: (id: string) => Promise<void>;
  touchPage: (id: string) => void;
  addAttachment: (pageId: string, file: File) => Promise<{ meta: AttachmentMeta; src: string }>;
  saveServers: (servers: ServerEntry[]) => void;
  setSettings: (patch: Partial<NotebookState["settings"]>) => void;
  importBundle: (b: {
    spaces: Space[];
    pages: PageMeta[];
    attachments: AttachmentMeta[];
    docs: Map<string, PmDoc>;
    files: Map<string, Uint8Array>;
  }) => Promise<void>;
  flush: () => Promise<void>;
}

const Ctx = createContext<StoreApi | null>(null);

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("StoreProvider fehlt");
  return ctx;
}

export async function loadState(): Promise<NotebookState> {
  const raw = await data.read("state");
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return emptyState();
  }
}

export function StoreProvider({
  initial,
  children,
}: {
  initial: NotebookState;
  children: ReactNode;
}) {
  const [state, setState] = useState<NotebookState>(initial);
  const latest = useRef(state);
  const timer = useRef<number | null>(null);

  const persist = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    await data.write("state", JSON.stringify(latest.current));
  }, []);

  const update = useCallback(
    (fn: (s: NotebookState) => NotebookState) => {
      setState((prev) => {
        const next = fn(prev);
        latest.current = next;
        return next;
      });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        persist().catch((e) => console.error("Speichern fehlgeschlagen", e));
      }, 300);
    },
    [persist],
  );

  useEffect(() => () => void persist().catch(() => undefined), [persist]);

  const api = useMemo<StoreApi>(() => {
    const removePages = async (ids: string[]) => {
      const set = new Set(ids);
      const atts = latest.current.attachments.filter((a) => set.has(a.pageId));
      update((s) => ({
        ...s,
        pages: s.pages.filter((p) => !set.has(p.id)),
        attachments: s.attachments.filter((a) => !set.has(a.pageId)),
      }));
      for (const id of ids) await data.remove(pageKey(id)).catch(() => undefined);
      for (const a of atts) await files.remove(a.id).catch(() => undefined);
    };

    return {
      state,
      update,
      createSpace: (name) => {
        const space: Space = { id: newId(), name: name.trim() || "Neuer Bereich", icon: null, createdAt: nowIso() };
        update((s) => ({ ...s, spaces: [...s.spaces, space] }));
        return space;
      },
      renameSpace: (id, name) =>
        update((s) => ({
          ...s,
          spaces: s.spaces.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)),
        })),
      deleteSpace: async (id) => {
        const ids = latest.current.pages.filter((p) => p.spaceId === id).map((p) => p.id);
        await removePages(ids);
        update((s) => ({ ...s, spaces: s.spaces.filter((x) => x.id !== id) }));
      },
      createPage: (spaceId, parentId, title = "") => {
        const siblings = childrenOf(latest.current.pages, spaceId, parentId);
        const ts = nowIso();
        const page: PageMeta = {
          id: newId(),
          spaceId,
          parentId,
          title,
          icon: null,
          position: siblings.length ? siblings[siblings.length - 1].position + 1 : 0,
          createdAt: ts,
          updatedAt: ts,
        };
        update((s) => ({ ...s, pages: [...s.pages, page] }));
        return page;
      },
      updatePage: (id, patch) =>
        update((s) => ({
          ...s,
          pages: s.pages.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p)),
        })),
      movePage: (id, parentId) =>
        update((s) => {
          const page = s.pages.find((p) => p.id === id);
          if (!page) return s;
          if (parentId && (parentId === id || descendants(s.pages, id).includes(parentId))) return s;
          const siblings = childrenOf(s.pages, page.spaceId, parentId).filter((p) => p.id !== id);
          const position = siblings.length ? siblings[siblings.length - 1].position + 1 : 0;
          return {
            ...s,
            pages: s.pages.map((p) => (p.id === id ? { ...p, parentId, position, updatedAt: nowIso() } : p)),
          };
        }),
      deletePage: async (id) => {
        await removePages([id, ...descendants(latest.current.pages, id)]);
      },
      touchPage: (id) =>
        update((s) => ({
          ...s,
          pages: s.pages.map((p) => (p.id === id ? { ...p, updatedAt: nowIso() } : p)),
        })),
      addAttachment: async (pageId, file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const meta: AttachmentMeta = {
          id: newId(),
          pageId,
          fileName: safeFileName(file.name || "bild.png"),
          mimeType: file.type || "application/octet-stream",
          size: bytes.length,
        };
        await files.write(meta.id, bytesToBase64(bytes));
        update((s) => ({ ...s, attachments: [...s.attachments, meta] }));
        return { meta, src: localAttachmentSrc(meta.id, meta.fileName) };
      },
      saveServers: (servers) => update((s) => ({ ...s, servers })),
      setSettings: (patch) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      importBundle: async (b) => {
        for (const [id, doc] of b.docs) await saveDoc(id, doc);
        for (const [id, bytes] of b.files) await files.write(id, bytesToBase64(bytes));
        update((s) => ({
          ...s,
          spaces: [...s.spaces, ...b.spaces],
          pages: [...s.pages, ...b.pages],
          attachments: [...s.attachments, ...b.attachments],
        }));
      },
      flush: persist,
    };
  }, [state, update, persist]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
