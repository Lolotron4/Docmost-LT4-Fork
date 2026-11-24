// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export type AiProvider = "anthropic" | "openai" | "google";
export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai", "google"];
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  google: "Gemini (Google)",
};
export const AI_KEY_URLS: Record<AiProvider, string> = {
  anthropic: "https://platform.claude.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
};

export type AiAction =
  | "continue"
  | "write"
  | "summarize"
  | "improve"
  | "fixGrammar"
  | "shorter"
  | "longer"
  | "simplify"
  | "translate"
  | "custom";

export interface IAiSettings {
  enabled: boolean;
  provider: AiProvider;
  models: Record<AiProvider, string>;
  defaultModels: Record<AiProvider, string>;
  keys: Record<AiProvider, string | null>;
  access: "all" | "restricted";
  allowedGroups: { id: string; name: string }[];
  allowedUsers: { id: string; name: string; email: string | null; avatarUrl: string | null }[];
}

export interface IAiSettingsInput {
  enabled?: boolean;
  provider?: AiProvider;
  models?: Partial<Record<AiProvider, string>>;
  apiKeys?: Partial<Record<AiProvider, string>>;
  access?: "all" | "restricted";
  allowedGroupIds?: string[];
  allowedUserIds?: string[];
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const getAiSettings = () => post<IAiSettings>("/ai/settings");
export const updateAiSettings = (data: IAiSettingsInput) =>
  post<IAiSettings>("/ai/settings/update", data);
export const listAiModels = (provider: AiProvider) =>
  post<{ models: string[] }>("/ai/models", { provider });
export const getAiStatus = () =>
  post<{ enabled: boolean; allowed: boolean; ready: boolean; provider: AiProvider }>(
    "/ai/status",
  );

const STREAM_ERROR = "\u0000LT4_AI_ERROR:";

export interface AiGenerateInput {
  action: AiAction;
  text?: string;
  prompt?: string;
  language?: string;
}

/**
 * Startet eine KI-Anfrage und ruft onText mit dem bisher erzeugten Gesamttext auf.
 * Gibt den fertigen Text zurück; Fehler werden als Error geworfen.
 */
export async function streamAiText(
  input: AiGenerateInput,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/ai/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch {
      // keine JSON-Antwort
    }
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const errorAt = text.indexOf(STREAM_ERROR);
    if (errorAt >= 0) {
      throw new Error(text.slice(errorAt + STREAM_ERROR.length));
    }
    onText(text.split("\u0000")[0]);
  }
  text += decoder.decode();
  return text;
}
