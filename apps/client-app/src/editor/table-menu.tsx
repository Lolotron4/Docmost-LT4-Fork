// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Menü unter einer Tabelle (wie in der Web-Version): Spalten/Zeilen einfügen und löschen,
// Zellen verbinden/teilen, Kopfzeile/-spalte, Zellfarbe, Ausrichtung, Tabelle löschen.
import { useEffect, useLayoutEffect, useRef, useState, type ElementType } from "react";
import { findParentNode, useEditorState, type Editor } from "@tiptap/react";
import { ActionIcon, ColorSwatch, Group, Popover, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconCheck,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconPalette,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconSquaresDiagonal,
  IconSquareToggle,
  IconTableColumn,
  IconTableRow,
  IconTrashX,
} from "@tabler/icons-react";
import classes from "../../../client/src/features/editor/components/common/toolbar-menu.module.css";

const COLORS = [
  { name: "Standard", color: "" },
  { name: "Blau", color: "#b4d5ff" },
  { name: "Grün", color: "#acf5d2" },
  { name: "Gelb", color: "#fef1b4" },
  { name: "Rot", color: "#ffbead" },
  { name: "Rosa", color: "#ffc7fe" },
  { name: "Grau", color: "#eaecef" },
  { name: "Lila", color: "#c1b7f2" },
];

const findTable = findParentNode((n) => n.type.name === "table");

function Btn({ label, icon: Icon, onClick, active }: { label: string; icon: ElementType; onClick: () => void; active?: boolean }) {
  return (
    <Tooltip label={label} position="top">
      <ActionIcon size="lg" variant="subtle" aria-label={label} onClick={onClick} className={active ? classes.active : undefined}>
        <Icon size={18} />
      </ActionIcon>
    </Tooltip>
  );
}

export function TableMenu({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e?.isEditable) return null;
      const parent = findTable(e.state.selection);
      if (!parent) return null;
      const cell = e.isActive("tableHeader") ? e.getAttributes("tableHeader") : e.getAttributes("tableCell");
      return {
        pos: parent.pos,
        color: (cell.backgroundColor as string) || "",
        canMerge: e.can().mergeCells(),
        canSplit: e.can().splitCell(),
        align: e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "right" }) ? "right" : "left",
      };
    },
  });
  const [top, setTop] = useState<number | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [hex, setHex] = useState("");
  const box = useRef<HTMLDivElement>(null);
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
    setTop(dom.getBoundingClientRect().bottom - container.getBoundingClientRect().top + 6);
  });

  if (!info || top === null || !active) return null;

  const run = (fn: (c: any) => any) => fn(editor.chain().focus(undefined, { scrollIntoView: false }) as any).run();
  const setColor = (color: string, name: string) => {
    const attrs = { backgroundColor: color || null, backgroundColorName: color ? name : null };
    run((c) => c.updateAttributes("tableCell", attrs).updateAttributes("tableHeader", attrs));
    setColorOpen(false);
  };

  return (
    <div
      ref={box}
      contentEditable={false}
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("input")) e.preventDefault();
      }}
      style={{ position: "absolute", top, left: "50%", transform: "translateX(-50%)", zIndex: 99, width: "max-content", maxWidth: "calc(100vw - 32px)" }}
    >
      <div className={classes.toolbar} style={{ flexWrap: "wrap" }}>
        <Btn label="Spalte links einfügen" icon={IconColumnInsertLeft} onClick={() => run((c) => c.addColumnBefore())} />
        <Btn label="Spalte rechts einfügen" icon={IconColumnInsertRight} onClick={() => run((c) => c.addColumnAfter())} />
        <Btn label="Spalte löschen" icon={IconColumnRemove} onClick={() => run((c) => c.deleteColumn())} />
        <div className={classes.divider} />
        <Btn label="Zeile oberhalb einfügen" icon={IconRowInsertTop} onClick={() => run((c) => c.addRowBefore())} />
        <Btn label="Zeile unterhalb einfügen" icon={IconRowInsertBottom} onClick={() => run((c) => c.addRowAfter())} />
        <Btn label="Zeile löschen" icon={IconRowRemove} onClick={() => run((c) => c.deleteRow())} />
        <div className={classes.divider} />
        {info.canMerge && <Btn label="Zellen verbinden" icon={IconSquaresDiagonal} onClick={() => run((c) => c.mergeCells())} />}
        {info.canSplit && <Btn label="Zelle teilen" icon={IconSquareToggle} onClick={() => run((c) => c.splitCell())} />}
        <Btn label="Kopfzeile an/aus" icon={IconTableRow} onClick={() => run((c) => c.toggleHeaderRow())} />
        <Btn label="Kopfspalte an/aus" icon={IconTableColumn} onClick={() => run((c) => c.toggleHeaderColumn())} />
        <div className={classes.divider} />
        <Popover opened={colorOpen} onChange={setColorOpen} withinPortal={false} position="bottom" shadow="md" width={210}>
          <Popover.Target>
            <Tooltip label="Zellfarbe" position="top">
              <ActionIcon size="lg" variant="subtle" aria-label="Zellfarbe" onClick={() => setColorOpen((o) => !o)}>
                <IconPalette size={18} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                Hintergrund der Zelle
              </Text>
              {COLORS.map((c) => (
                <UnstyledButton key={c.name} onClick={() => setColor(c.color, c.name)} className="lt4-slash-item">
                  <Group gap={8} wrap="nowrap">
                    <ColorSwatch color={c.color || "transparent"} size={16} style={{ border: "1px solid var(--mantine-color-default-border)" }} />
                    <Text size="sm" style={{ flex: 1 }}>
                      {c.name}
                    </Text>
                    {info.color === c.color && <IconCheck size={14} />}
                  </Group>
                </UnstyledButton>
              ))}
              <TextInput
                size="xs"
                placeholder="#ffd8a8"
                value={hex}
                onChange={(e) => setHex(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && /^#[0-9a-f]{3,8}$/i.test(hex.trim())) setColor(hex.trim(), "Eigene");
                }}
                aria-label="Eigene Farbe (Hex)"
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
        <Btn label="Links ausrichten" icon={IconAlignLeft} active={info.align === "left"} onClick={() => run((c) => c.setTextAlign("left"))} />
        <Btn label="Zentrieren" icon={IconAlignCenter} active={info.align === "center"} onClick={() => run((c) => c.setTextAlign("center"))} />
        <Btn label="Rechts ausrichten" icon={IconAlignRight} active={info.align === "right"} onClick={() => run((c) => c.setTextAlign("right"))} />
        <div className={classes.divider} />
        <Btn label="Tabelle löschen" icon={IconTrashX} onClick={() => run((c) => c.deleteTable())} />
      </div>
    </div>
  );
}
