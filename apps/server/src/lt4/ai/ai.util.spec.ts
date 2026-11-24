// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  buildUserMessage,
  decryptApiKey,
  encryptApiKey,
  maskKey,
  MAX_INPUT_CHARS,
} from './ai.util';

describe('LT4 KI-Assistent – Hilfsfunktionen', () => {
  it('baut Nachrichten für Textaktionen und verlangt Text', () => {
    expect(buildUserMessage({ action: 'summarize' })).toBeNull();
    const msg = buildUserMessage({ action: 'fixGrammar', text: 'Das ist ein Tset.' });
    expect(msg).toContain('<text>\nDas ist ein Tset.\n</text>');
    expect(msg).toMatch(/spelling/);
  });

  it('übersetzt in die gewünschte Sprache, sonst Englisch', () => {
    expect(buildUserMessage({ action: 'translate', text: 'Hallo', language: 'Französisch' })).toContain(
      'into Französisch',
    );
    expect(buildUserMessage({ action: 'translate', text: 'Hallo' })).toContain('into English');
  });

  it('schreibt aus einer Anweisung, optional mit Kontext', () => {
    expect(buildUserMessage({ action: 'write' })).toBeNull();
    expect(buildUserMessage({ action: 'write', prompt: 'Gedicht über Minecraft' })).toBe(
      'Gedicht über Minecraft',
    );
    expect(buildUserMessage({ action: 'custom', prompt: 'Als Tabelle', text: 'a, b' })).toContain(
      'Als Tabelle\n\n<text>',
    );
  });

  it('kürzt zu lange Eingaben', () => {
    const msg = buildUserMessage({ action: 'improve', text: 'x'.repeat(MAX_INPUT_CHARS + 500) })!;
    expect(msg.length).toBeLessThan(MAX_INPUT_CHARS + 400);
  });

  it('verschlüsselt API-Schlüssel umkehrbar und maskiert sie', () => {
    const stored = encryptApiKey('sk-test-1234abcd', 'geheim');
    expect(stored).not.toContain('sk-test');
    expect(decryptApiKey(stored, 'geheim')).toBe('sk-test-1234abcd');
    expect(() => decryptApiKey(stored, 'anders')).toThrow();
    expect(maskKey('sk-test-1234abcd')).toBe('…abcd');
  });
});
