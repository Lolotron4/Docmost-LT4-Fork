// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// KI-Schreibassistent im Editor: öffnet sich über „Ask AI“ in der Auswahlleiste oder /ki.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCheck,
  IconChevronRight,
  IconFileDescription,
  IconLanguage,
  IconMoodSmile,
  IconPencil,
  IconPlayerStopFilled,
  IconRefresh,
  IconRowInsertBottom,
  IconSend,
  IconSparkles,
  IconTextSpellcheck,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import { markdownToHtml } from "@docmost/editor-ext";
import { showAiMenuAtom } from "@/features/editor/atoms/editor-atoms";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { AiAction, AiGenerateInput, streamAiText } from "@/lt4/ai/services/ai-service";
import { AI_OPEN_EVENT, setAiAssistantEnabled } from "@/lt4/ai/ai-open";
import classes from "./ai-menu.module.css";

type Range = { from: number; to: number };
type Phase = "idle" | "running" | "done" | "error";

const PANEL_WIDTH = 480;
const CONTEXT_CHARS = 4000;

/** Sprachen fürs Übersetzen: Anzeige wird übersetzt, an die KI geht der englische Name. */
const LANGUAGES = [
  "English",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Dutch",
  "Polish",
  "Turkish",
  "Latin",
];

const TEXT_ACTIONS: { action: AiAction; label: string; icon: typeof IconWand }[] = [
  { action: "improve", label: "Improve writing", icon: IconWand },
  { action: "fixGrammar", label: "Fix spelling & grammar", icon: IconTextSpellcheck },
  { action: "shorter", label: "Make shorter", icon: IconArrowsMinimize },
  { action: "longer", label: "Make longer", icon: IconArrowsMaximize },
  { action: "simplify", label: "Simplify language", icon: IconMoodSmile },
  { action: "summarize", label: "Summarize", icon: IconFileDescription },
];

async function toHtml(markdown: string) {
  const html = String(await Promise.resolve(markdownToHtml(markdown.trim())));
  // Ein einzelner Absatz wird als Fließtext eingefügt, damit er nicht den Absatz teilt.
  const single = html.trim().match(/^<p>([\s\S]*)<\/p>$/);
  if (single && !single[1].includes("<p>")) return { html: single[1], inline: true };
  return { html, inline: false };
}

export function EditorAiMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(showAiMenuAtom);
  const workspace = useAtomValue(workspaceAtom);
  const enabled = workspace?.settings?.ai?.generative === true;

  const [range, setRange] = useState<Range | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const lastRequest = useRef<AiGenerateInput | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAiAssistantEnabled(enabled);
    return () => setAiAssistantEnabled(false);
  }, [enabled]);

  // /ki-Befehl öffnet das Menü
  useEffect(() => {
    const handler = () => {
      if (enabled) setOpen(true);
    };
    window.addEventListener(AI_OPEN_EVENT, handler);
    return () => window.removeEventListener(AI_OPEN_EVENT, handler);
  }, [enabled, setOpen]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setResult("");
    setError("");
    setPrompt("");
  }, []);

  const close = useCallback(() => {
    reset();
    setRange(null);
    setOpen(false);
  }, [reset, setOpen]);

  // Beim Öffnen Auswahl merken
  useEffect(() => {
    if (!open) return;
    const { from, to } = editor.state.selection;
    setRange({ from, to });
    setSelectedText(from === to ? "" : editor.state.doc.textBetween(from, to, "\n\n", " "));
    reset();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, editor, reset]);

  // Position unter der Auswahl (oder darüber, wenn unten kein Platz ist)
  const place = useCallback(() => {
    if (!range) return;
    try {
      const start = editor.view.coordsAtPos(range.from);
      const end = editor.view.coordsAtPos(range.to);
      const panelHeight = panelRef.current?.offsetHeight ?? 320;
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 32);
      let left = Math.min(start.left, window.innerWidth - width - 16);
      left = Math.max(16, left);
      let top = end.bottom + 8;
      if (top + panelHeight > window.innerHeight - 16 && start.top - panelHeight - 8 > 16) {
        top = start.top - panelHeight - 8;
      }
      setPosition({ top, left });
    } catch {
      setPosition(null);
    }
  }, [editor, range]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, phase, result]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  // Escape schließt, Klick außerhalb schließt nur ohne Ergebnis
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (panelRef.current?.contains(target)) return;
      if (target?.closest?.(".mantine-Menu-dropdown")) return;
      if (phase === "idle") close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, close, phase]);

  const contextBefore = () => {
    if (!range) return "";
    const from = Math.max(0, range.from - CONTEXT_CHARS);
    return editor.state.doc.textBetween(from, range.from, "\n\n", " ");
  };

  const run = async (input: AiGenerateInput) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastRequest.current = input;
    setPhase("running");
    setResult("");
    setError("");
    try {
      const text = await streamAiText(input, setResult, controller.signal);
      if (controller.signal.aborted) return;
      setResult(text);
      setPhase(text.trim() ? "done" : "error");
      if (!text.trim()) setError(t("The AI returned no text."));
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setError(t(err?.message || "The AI request failed."));
      setPhase("error");
    }
  };

  const runAction = (action: AiAction, extra: Partial<AiGenerateInput> = {}) =>
    run({ action, text: selectedText, ...extra });

  const submitPrompt = () => {
    const value = prompt.trim();
    if (!value) return;
    if (selectedText) run({ action: "custom", prompt: value, text: selectedText });
    else run({ action: "write", prompt: value, text: contextBefore() });
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase(result.trim() ? "done" : "idle");
  };

  /** Position direkt nach dem Block, in dem die Auswahl endet. */
  const blockEnd = () => {
    const $to = editor.state.doc.resolve(range!.to);
    return $to.depth > 0 ? $to.after(1) : range!.to;
  };

  /** Leerer Absatz (z. B. nach /ki) wird ersetzt statt darunter einzufügen. */
  const emptyBlockRange = (): Range | null => {
    const $from = editor.state.doc.resolve(range!.from);
    if ($from.depth === 0) return null;
    const node = $from.parent;
    if (node.type.name === "paragraph" && node.content.size === 0) {
      return { from: $from.before(), to: $from.after() };
    }
    return null;
  };

  const insert = async (mode: "replace" | "below") => {
    if (!range || !result.trim()) return;
    const { html, inline } = await toHtml(result);
    const chain = editor.chain().focus();
    if (mode === "replace" && range.from !== range.to) {
      chain.insertContentAt(range, html).run();
    } else {
      const empty = emptyBlockRange();
      const content = inline ? `<p>${html}</p>` : html;
      if (empty) chain.insertContentAt(empty, content).run();
      else chain.insertContentAt(blockEnd(), content).run();
    }
    close();
  };

  if (!open || !enabled) return null;

  const hasSelection = !!selectedText.trim();

  const panel = (
    <Paper
      ref={panelRef}
      shadow="lg"
      radius="md"
      withBorder
      className={classes.panel}
      style={{
        top: position?.top ?? 120,
        left: position?.left ?? 120,
        width: Math.min(PANEL_WIDTH, window.innerWidth - 32),
      }}
      data-lt4-ai-menu
      onMouseDown={(e) => {
        // Editor-Auswahl nicht verlieren, außer beim Tippen ins Eingabefeld
        if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
      }}
    >
      {phase !== "idle" && (
        <div className={classes.result}>
          <ScrollArea.Autosize mah={280} type="auto">
            <Text size="sm" className={classes.resultText}>
              {result}
            </Text>
            {phase === "running" && (
              <Group gap={6} mt={result ? 6 : 0}>
                <Loader size="xs" type="dots" />
                <Text size="xs" c="dimmed">
                  {t("AI is writing…")}
                </Text>
              </Group>
            )}
            {phase === "error" && (
              <Text size="sm" c="red">
                {error}
              </Text>
            )}
          </ScrollArea.Autosize>

          <Group gap="xs" mt="sm" justify="space-between" wrap="nowrap">
            {phase === "running" ? (
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<IconPlayerStopFilled size={14} />}
                onClick={stop}
              >
                {t("Stop")}
              </Button>
            ) : (
              <Group gap="xs">
                {phase === "done" && hasSelection && (
                  <Button
                    size="compact-sm"
                    leftSection={<IconCheck size={14} />}
                    onClick={() => insert("replace")}
                  >
                    {t("Replace selection")}
                  </Button>
                )}
                {phase === "done" && (
                  <Button
                    size="compact-sm"
                    variant={hasSelection ? "default" : "filled"}
                    leftSection={<IconRowInsertBottom size={14} />}
                    onClick={() => insert("below")}
                  >
                    {hasSelection ? t("Insert below") : t("Insert")}
                  </Button>
                )}
              </Group>
            )}
            <Group gap={4} wrap="nowrap">
              {phase !== "running" && lastRequest.current && (
                <Tooltip label={t("Try again")} withinPortal>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t("Try again")}
                    onClick={() => run(lastRequest.current!)}
                  >
                    <IconRefresh size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              {phase !== "running" && (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={t("Back")}
                  onClick={reset}
                >
                  <IconArrowBackUp size={16} />
                </ActionIcon>
              )}
              <ActionIcon variant="subtle" color="gray" aria-label={t("Discard")} onClick={close}>
                <IconX size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </div>
      )}

      {phase === "idle" && (
        <Stack gap={4}>
          <TextInput
            ref={inputRef}
            leftSection={<IconSparkles size={16} />}
            rightSection={
              <ActionIcon
                variant="subtle"
                disabled={!prompt.trim()}
                onClick={submitPrompt}
                aria-label={t("Send")}
              >
                <IconSend size={16} />
              </ActionIcon>
            }
            placeholder={
              hasSelection
                ? t("Tell the AI what to do with the selected text…")
                : t("Ask the AI to write something…")
            }
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submitPrompt();
              }
            }}
          />

          {hasSelection ? (
            <>
              <Text size="xs" c="dimmed" px={4} pt={4}>
                {t("Selected text: {{count}} characters", { count: selectedText.length })}
              </Text>
              {TEXT_ACTIONS.map(({ action, label, icon: Icon }) => (
                <UnstyledButton
                  key={action}
                  className={classes.item}
                  onClick={() => runAction(action)}
                >
                  <Icon size={16} />
                  <span>{t(label)}</span>
                </UnstyledButton>
              ))}
              <Menu position="right-start" offset={4} withinPortal shadow="md">
                <Menu.Target>
                  <UnstyledButton className={classes.item}>
                    <IconLanguage size={16} />
                    <span style={{ flex: 1 }}>{t("Translate")}</span>
                    <IconChevronRight size={14} />
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  {LANGUAGES.map((language) => (
                    <Menu.Item
                      key={language}
                      onClick={() => runAction("translate", { language })}
                    >
                      {t(language)}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </>
          ) : (
            <UnstyledButton
              className={classes.item}
              disabled={!contextBefore().trim()}
              onClick={() => run({ action: "continue", text: contextBefore() })}
            >
              <IconPencil size={16} />
              <span>{t("Continue writing")}</span>
            </UnstyledButton>
          )}
        </Stack>
      )}
    </Paper>
  );

  return createPortal(panel, document.body);
}
