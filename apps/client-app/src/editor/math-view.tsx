// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Mathe-Formeln (LaTeX über KaTeX), inline und als Block. Klick öffnet ein Eingabefeld
// mit Live-Vorschau. Gleiche Knoten wie die Web-Version (mathInline / mathBlock, Attribut text).
import "katex/dist/katex.min.css";
import katex from "katex";
import "katex/contrib/mhchem";
import { useEffect, useMemo, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ActionIcon, Group, Popover, Text, Textarea } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import classes from "../../../client/src/features/editor/components/math/math.module.css";

export function renderKatex(src: string, displayMode: boolean): { html: string; error: string | null } {
  if (!src.trim()) return { html: "", error: null };
  try {
    return { html: katex.renderToString(src, { displayMode, throwOnError: true }), error: null };
  } catch (e: any) {
    return { html: "", error: String(e?.message ?? e) };
  }
}

// Vom Slash-Menü gesetzt: die nächste neu eingefügte leere Formel öffnet sofort das Eingabefeld.
let autoOpenAt = 0;
export function markMathAutoOpen() {
  autoOpenAt = Date.now();
}

function MathView(props: NodeViewProps & { block: boolean }) {
  const { node, updateAttributes, editor, getPos, selected, deleteNode, block } = props;
  const text: string = node.attrs.text ?? "";
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(text);

  // Frisch eingefügte (leere) Formel direkt bearbeiten
  useEffect(() => {
    if (!text && editor.isEditable && Date.now() - autoOpenAt < 1500) {
      autoOpenAt = 0;
      setDraft("");
      setOpened(true);
    }
  }, []);
  useEffect(() => {
    if (selected && editor.isEditable && !text) {
      setDraft("");
      setOpened(true);
    }
  }, [selected]);

  const shown = useMemo(() => renderKatex(text, block), [text, block]);
  const preview = useMemo(() => renderKatex(draft, block), [draft, block]);

  const close = () => {
    setOpened(false);
    if (draft.trim() !== text) queueMicrotask(() => updateAttributes({ text: draft.trim() }));
    const pos = getPos();
    if (typeof pos === "number") editor.commands.focus(pos + node.nodeSize);
  };

  const cls = [block ? classes.mathBlock : classes.mathInline];
  if (!text.trim()) cls.push(classes.empty);
  else if (shown.error) cls.push(classes.error);

  return (
    <NodeViewWrapper
      as={block ? "div" : "span"}
      style={block ? undefined : { display: "inline" }}
      data-katex="true"
    >
      <Popover
        opened={opened && editor.isEditable}
        onChange={(o) => (o ? setOpened(true) : close())}
        onClose={close}
        position="bottom"
        withArrow
        shadow="md"
        trapFocus
        width={block ? 460 : 340}
      >
        <Popover.Target>
          <span
            className={cls.join(" ")}
            style={{ cursor: editor.isEditable ? "pointer" : undefined }}
            onClick={() => {
              if (!editor.isEditable) return;
              setDraft(text);
              setOpened(true);
            }}
          >
            {!text.trim() ? (
              block ? "Formel eingeben (LaTeX)" : "Formel"
            ) : shown.error ? (
              text
            ) : (
              <span dangerouslySetInnerHTML={{ __html: shown.html }} />
            )}
          </span>
        </Popover.Target>
        <Popover.Dropdown>
          <Textarea
            autosize
            minRows={block ? 3 : 1}
            maxRows={10}
            value={draft}
            placeholder={block ? "z. B. \\int_0^1 x^2\\,dx = \\frac{1}{3}" : "z. B. a^2 + b^2 = c^2"}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && (!block || e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                close();
              }
            }}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            data-autofocus
          />
          {draft.trim() && (
            <div style={{ marginTop: 8, overflowX: "auto", textAlign: block ? "center" : undefined }}>
              {preview.error ? (
                <Text size="xs" c="red">
                  {preview.error}
                </Text>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: preview.html }} />
              )}
            </div>
          )}
          <Group justify="space-between" mt={6}>
            <Text size="xs" c="dimmed">
              {block ? "Strg+Enter zum Übernehmen" : "Enter zum Übernehmen"}
            </Text>
            <ActionIcon variant="subtle" color="red" size="sm" aria-label="Formel löschen" onClick={() => deleteNode()}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Popover.Dropdown>
      </Popover>
    </NodeViewWrapper>
  );
}

export const MathInlineView = (p: NodeViewProps) => <MathView {...p} block={false} />;
export const MathBlockView = (p: NodeViewProps) => <MathView {...p} block />;
