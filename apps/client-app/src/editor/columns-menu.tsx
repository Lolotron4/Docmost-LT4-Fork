// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Menü unter einem Spalten-Block (wie in der Web-Version): Anzahl 2–5, Aufteilung,
// normale/volle Breite, kopieren (als Kopie darunter) und löschen.
import { useEffect, useLayoutEffect, useRef, useState, type ElementType } from "react";
import { findParentNode, useEditorState, type Editor } from "@tiptap/react";
import { ActionIcon, Button, Menu, Tooltip } from "@mantine/core";
import {
  IconArrowsHorizontal,
  IconCheck,
  IconChevronDown,
  IconColumns2,
  IconColumns3,
  IconCopy,
  IconLayoutAlignCenter,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconTrash,
} from "@tabler/icons-react";
import type { ColumnsLayout } from "@docmost/editor-ext";
import classes from "../../../client/src/features/editor/components/common/toolbar-menu.module.css";

type Preset = { layout: ColumnsLayout; label: string; icon: ElementType };

const PRESETS: Record<number, Preset[]> = {
  2: [
    { layout: "two_equal", label: "Gleich breit", icon: IconColumns2 },
    { layout: "two_left_sidebar", label: "Schmale Spalte links", icon: IconLayoutSidebar },
    { layout: "two_right_sidebar", label: "Schmale Spalte rechts", icon: IconLayoutSidebarRight },
  ],
  3: [
    { layout: "three_equal", label: "Gleich breit", icon: IconColumns3 },
    { layout: "three_with_sidebars", label: "Mitte breit", icon: IconLayoutAlignCenter },
    { layout: "three_left_wide", label: "Links breit", icon: IconLayoutSidebarRight },
    { layout: "three_right_wide", label: "Rechts breit", icon: IconLayoutSidebar },
  ],
};

const findColumns = findParentNode((n) => n.type.name === "columns");

export function ColumnsMenu({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e?.isEditable || e.isActive("table")) return null;
      const parent = findColumns(e.state.selection);
      if (!parent) return null;
      return {
        pos: parent.pos,
        count: parent.node.childCount,
        layout: (parent.node.attrs.layout as ColumnsLayout) || "two_equal",
        wide: parent.node.attrs.widthMode === "wide",
      };
    },
  });
  const [top, setTop] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Sichtbar, solange der Editor oder das Menü selbst den Fokus hat.
  const [active, setActive] = useState(editor.isFocused);
  useEffect(() => {
    const onFocus = () => setActive(true);
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const next = event.relatedTarget as Node | null;
      if (next && box.current?.contains(next)) return;
      setActive(false);
    };
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor]);

  useLayoutEffect(() => {
    if (!info || !container) return setTop(null);
    const dom = editor.view.nodeDOM(info.pos) as HTMLElement | null;
    if (!dom) return setTop(null);
    const a = dom.getBoundingClientRect();
    const b = container.getBoundingClientRect();
    setTop(a.bottom - b.top + 6);
  });

  if (!info || top === null || !active) return null;

  const run = (fn: (c: any) => any) => fn(editor.chain().focus(undefined, { scrollIntoView: false }) as any).run();
  const presets = PRESETS[info.count] ?? [];

  return (
    <div
      ref={box}
      contentEditable={false}
      onMouseDown={(e) => {
        // Fokus im Editor lassen, sonst verschwindet das Menü
        if (!(e.target as HTMLElement).closest("input")) e.preventDefault();
      }}
      style={{ position: "absolute", top, left: "50%", transform: "translateX(-50%)", zIndex: 99, width: "max-content", maxWidth: "calc(100vw - 32px)" }}
    >
      <div className={classes.toolbar}>
        <Menu position="bottom-start" withinPortal={false} shadow="md" returnFocus={false}>
          <Menu.Target>
            <Button variant="subtle" color="dark" size="compact-sm" rightSection={<IconChevronDown size={12} />}>
              {info.count} Spalten
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {[2, 3, 4, 5].map((n) => (
              <Menu.Item
                key={n}
                rightSection={n === info.count ? <IconCheck size={14} /> : null}
                onClick={() => run((c) => c.setColumnCount(n))}
              >
                {n} Spalten
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        {presets.length > 0 && <div className={classes.divider} />}
        {presets.map((p) => (
          <Tooltip key={p.layout} label={p.label} position="top">
            <ActionIcon
              size="lg"
              variant="subtle"
              aria-label={p.label}
              className={info.layout === p.layout ? classes.active : undefined}
              onClick={() => run((c) => c.setColumnsLayout(p.layout))}
            >
              <p.icon size={18} />
            </ActionIcon>
          </Tooltip>
        ))}
        <div className={classes.divider} />
        <Tooltip label={info.wide ? "Normale Breite" : "Volle Breite"} position="top">
          <ActionIcon
            size="lg"
            variant="subtle"
            aria-label="Breite umschalten"
            className={info.wide ? classes.active : undefined}
            onClick={() => run((c) => c.setColumnsWidthMode(info.wide ? "normal" : "wide"))}
          >
            <IconArrowsHorizontal size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Duplizieren" position="top">
          <ActionIcon
            size="lg"
            variant="subtle"
            aria-label="Spalten duplizieren"
            onClick={() => {
              const node = editor.state.doc.nodeAt(info.pos);
              if (node) run((c) => c.insertContentAt(info.pos + node.nodeSize, node.toJSON()));
            }}
          >
            <IconCopy size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Löschen" position="top">
          <ActionIcon
            size="lg"
            variant="subtle"
            aria-label="Spalten löschen"
            onClick={() => run((c) => c.setNodeSelection(info.pos).deleteSelection())}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}
