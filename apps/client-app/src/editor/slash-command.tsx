// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// "/"-Menü wie in der Web-Version: Blöcke per Tastatur einfügen.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { Group, Paper, ScrollArea, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import {
  IconBlockquote,
  IconH1,
  IconH2,
  IconH3,
  IconInfoCircle,
  IconLayoutBottombarCollapse,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconPhoto,
  IconSeparatorHorizontal,
  IconSourceCode,
  IconTable,
  IconTypography,
  type Icon,
} from "@tabler/icons-react";

/** Ereignis, mit dem das "/"-Menü den Bild-Dialog des Editors öffnet. */
export const INSERT_IMAGE_EVENT = "lt4-insert-image";

export interface SlashItem {
  title: string;
  description: string;
  keywords: string[];
  icon: Icon;
  run: (editor: Editor, range: Range) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  { title: "Text", description: "Normaler Absatz", keywords: ["p", "absatz", "paragraph"], icon: IconTypography,
    run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: "Überschrift 1", description: "Große Überschrift", keywords: ["h1", "heading", "titel"], icon: IconH1,
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: "Überschrift 2", description: "Mittlere Überschrift", keywords: ["h2", "heading"], icon: IconH2,
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: "Überschrift 3", description: "Kleine Überschrift", keywords: ["h3", "heading"], icon: IconH3,
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: "Aufzählung", description: "Liste mit Punkten", keywords: ["ul", "bullet", "liste"], icon: IconList,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Nummerierung", description: "Liste mit Zahlen", keywords: ["ol", "numbered", "liste"], icon: IconListNumbers,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: "Aufgabenliste", description: "Liste zum Abhaken", keywords: ["todo", "task", "checkbox"], icon: IconListCheck,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: "Infobox", description: "Hervorgehobener Hinweis", keywords: ["callout", "hinweis", "info"], icon: IconInfoCircle,
    run: (e, r) => (e.chain().focus().deleteRange(r) as any).toggleCallout({ type: "info" }).run() },
  { title: "Zitat", description: "Zitat einfügen", keywords: ["quote", "blockquote"], icon: IconBlockquote,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: "Codeblock", description: "Code mit fester Schrift", keywords: ["code", "pre"], icon: IconSourceCode,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: "Aufklappbarer Bereich", description: "Inhalt zum Auf- und Zuklappen", keywords: ["details", "toggle", "aufklapper"], icon: IconLayoutBottombarCollapse,
    run: (e, r) => (e.chain().focus().deleteRange(r) as any).setDetails().run() },
  { title: "Tabelle", description: "Tabelle 3×3", keywords: ["table"], icon: IconTable,
    run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Bild", description: "Bild vom Gerät einfügen", keywords: ["image", "foto", "picture"], icon: IconPhoto,
    run: (e, r) => {
      e.chain().focus().deleteRange(r).run();
      window.dispatchEvent(new Event(INSERT_IMAGE_EVENT));
    } },
  { title: "Trennlinie", description: "Waagerechte Linie", keywords: ["hr", "divider", "linie"], icon: IconSeparatorHorizontal,
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (i) => i.title.toLowerCase().includes(q) || i.keywords.some((k) => k.startsWith(q)),
  );
}

interface ListHandle {
  onKeyDown: (e: KeyboardEvent) => boolean;
}

const SlashList = forwardRef<ListHandle, SuggestionProps<SlashItem>>(function SlashList(props, ref) {
  const [index, setIndex] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => setIndex(0), [props.items]);
  useEffect(() => {
    viewport.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const pick = (i: number) => {
    const item = props.items[i];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      const n = props.items.length;
      if (!n) return false;
      if (e.key === "ArrowDown") return setIndex((index + 1) % n), true;
      if (e.key === "ArrowUp") return setIndex((index + n - 1) % n), true;
      if (e.key === "Enter" || e.key === "Tab") return pick(index), true;
      return false;
    },
  }));

  if (!props.items.length) {
    return (
      <Paper shadow="md" p="xs" withBorder w={300}>
        <Text size="sm" c="dimmed">Nichts gefunden</Text>
      </Paper>
    );
  }
  return (
    <Paper shadow="md" p={4} withBorder w={300} className="lt4-slash-menu">
      <ScrollArea.Autosize mah={320} viewportRef={viewport} type="auto">
        {props.items.map((item, i) => (
          <UnstyledButton
            key={item.title}
            data-index={i}
            data-active={i === index || undefined}
            className="lt4-slash-item"
            onMouseEnter={() => setIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(i);
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="default" size={36} radius="md">
                <item.icon size={18} />
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>{item.title}</Text>
                <Text size="xs" c="dimmed">{item.description}</Text>
              </div>
            </Group>
          </UnstyledButton>
        ))}
      </ScrollArea.Autosize>
    </Paper>
  );
});

function place(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const h = el.offsetHeight || 340;
  const below = rect.bottom + 6;
  const top = below + h > window.innerHeight && rect.top - h - 6 > 0 ? rect.top - h - 6 : below;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 308));
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey("lt4-slash"),
        char: "/",
        startOfLine: false,
        allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== "codeBlock",
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<ListHandle, SuggestionProps<SlashItem>> | null = null;
          let box: HTMLDivElement | null = null;
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashList, { props, editor: props.editor });
              box = document.createElement("div");
              box.style.position = "fixed";
              box.style.zIndex = "300";
              box.appendChild(renderer.element);
              document.body.appendChild(box);
              requestAnimationFrame(() => box && place(box, props.clientRect?.()));
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              if (box) place(box, props.clientRect?.());
            },
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") {
                box?.remove();
                return true;
              }
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: () => {
              box?.remove();
              renderer?.destroy();
              box = null;
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
