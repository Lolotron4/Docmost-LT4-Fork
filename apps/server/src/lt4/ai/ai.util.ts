// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// KI-Schreibassistent: Anbieter, Standardmodelle und Prompt-Aufbau.
import { decryptSecret, encryptSecret } from '../mfa/mfa.util';

export const AI_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5.1',
  google: 'gemini-2.5-flash',
};

/** Claude-Modelle, bei denen die serverseitige Ausweichlösung bei Ablehnungen verfügbar ist. */
export const CLAUDE_FALLBACK_MODELS = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
  'claude-fable-5-1',
  'claude-fable-5-2',
]);

export const AI_ACTIONS = [
  'continue',
  'write',
  'summarize',
  'improve',
  'fixGrammar',
  'shorter',
  'longer',
  'simplify',
  'translate',
  'custom',
] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

/** Aktionen, die einen markierten Text brauchen. */
export const TEXT_ACTIONS: AiAction[] = [
  'summarize',
  'improve',
  'fixGrammar',
  'shorter',
  'longer',
  'simplify',
  'translate',
];

export const MAX_INPUT_CHARS = 30000;
export const MAX_PROMPT_CHARS = 2000;

export const SYSTEM_PROMPT = [
  'You are a writing assistant built into a collaborative document editor (used by school groups, families and small teams).',
  'Reply with the resulting text only: no preamble, no explanations, no closing remarks, and never wrap the whole answer in a code block.',
  'You may use Markdown for structure (headings, lists, bold, tables) when it fits the content.',
  'Unless asked to translate, write in the same language as the given text, or in the language of the instruction if there is no text.',
].join('\n');

const INSTRUCTIONS: Record<Exclude<AiAction, 'custom' | 'write' | 'translate' | 'continue'>, string> = {
  summarize: 'Summarize the text concisely. Keep the key points.',
  improve:
    'Improve the writing of the text: clearer wording, better flow, fixed mistakes. Keep the meaning, tone and approximate length.',
  fixGrammar:
    'Fix spelling, grammar and punctuation in the text. Change nothing else.',
  shorter: 'Rewrite the text to be noticeably shorter while keeping the essential content.',
  longer: 'Expand the text with more detail and explanation, keeping its style.',
  simplify:
    'Rewrite the text in simple, easy-to-understand language with short sentences.',
};

export type AiRequest = {
  action: AiAction;
  text?: string;
  prompt?: string;
  language?: string;
};

/** Baut die Nutzer-Nachricht für die gewählte Aktion. Gibt null zurück, wenn Eingaben fehlen. */
export function buildUserMessage(req: AiRequest): string | null {
  const text = (req.text ?? '').slice(0, MAX_INPUT_CHARS).trim();
  const prompt = (req.prompt ?? '').slice(0, MAX_PROMPT_CHARS).trim();
  const wrap = (t: string) => `<text>\n${t}\n</text>`;

  switch (req.action) {
    case 'continue':
      if (!text) return null;
      return `Continue the following text naturally with one or two paragraphs. Output only the new continuation, not the existing text.\n\n${wrap(text)}`;
    case 'write':
      if (!prompt) return null;
      return text
        ? `${prompt}\n\nSurrounding document text for context:\n${wrap(text)}`
        : prompt;
    case 'translate': {
      const language = (req.language ?? '').slice(0, 60).trim() || 'English';
      if (!text) return null;
      return `Translate the text into ${language}. Keep the formatting.\n\n${wrap(text)}`;
    }
    case 'custom':
      if (!prompt) return null;
      return text ? `${prompt}\n\n${wrap(text)}` : prompt;
    default:
      if (!text) return null;
      return `${INSTRUCTIONS[req.action]}\n\n${wrap(text)}`;
  }
}

export function encryptApiKey(key: string, appSecret: string) {
  return encryptSecret(key, `${appSecret}:lt4-ai`);
}

export function decryptApiKey(stored: string, appSecret: string) {
  return decryptSecret(stored, `${appSecret}:lt4-ai`);
}

/** Zeigt nur das Ende eines Schlüssels, z. B. "…a1b2". */
export function maskKey(key: string) {
  return key.length > 4 ? `…${key.slice(-4)}` : '…';
}

export function isProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value);
}
