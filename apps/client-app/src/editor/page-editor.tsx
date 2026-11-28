// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useRef, useState } from "react";
import { INSERT_BASE_EVENT, INSERT_IMAGE_EVENT, SlashCommand } from "./slash-command";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  ActionIcon,
  ColorInput,
  Divider,
  Group,
  Loader,
  Menu,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconHighlight,
  IconInfoCircle,
  IconItalic,
  IconLayoutBottombarCollapse,
  IconLink,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconPalette,
  IconPhoto,
  IconSeparatorHorizontal,
  IconSourceCode,
  IconStrikethrough,
  IconTable,
  IconUnderline,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { buildExtensions } from "./extensions";
import { ColumnsMenu } from "./columns-menu";
import { TableMenu } from "./table-menu";
import { loadDoc, saveDoc, useStore } from "../lib/store";
import type { PageMeta, PmDoc } from "../lib/types";
import { errorText } from "../lib/native";

const SWATCHES = [
  "#000000", "#868e96", "#e03131", "#e8590c", "#f08c00", "#2f9e44",
  "#1971c2", "#6741d9", "#c2255c", "#0c8599",
];

function Btn({
  label,
  icon: Icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: any;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip label={label} openDelay={400} withinPortal>
      <ActionIcon
        variant={active ? "light" : "subtle"}
        color={active ? "blue" : "gray"}
        size="md"
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
      >
        <Icon size={18} />
      </ActionIcon>
    </Tooltip>
  );
}

function ColorButton({
  editor,
  kind,
}: {
  editor: Editor;
  kind: "text" | "highlight";
}) {
  const [value, setValue] = useState("");
  const apply = (c: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
    if (kind === "text") editor.chain().focus().setColor(c).run();
    else editor.chain().focus().setHighlight({ color: c }).run();
  };
  return (
    <Popover position="bottom" withinPortal shadow="md">
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={kind === "text" ? "Textfarbe" : "Hervorheben"}
          onMouseDown={(e) => e.preventDefault()}
        >
          {kind === "text" ? <IconPalette size={18} /> : <IconHighlight size={18} />}
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={220}>
          <Text size="xs" c="dimmed">
            {kind === "text" ? "Textfarbe" : "Hervorhebung"} (Hex)
          </Text>
          <ColorInput
            value={value}
            onChange={setValue}
            onChangeEnd={apply}
            swatches={SWATCHES}
            swatchesPerRow={5}
            format="hex"
            placeholder="#1971c2"
            withPicker
          />
          <Text
            size="xs"
            c="blue"
            style={{ cursor: "pointer" }}
            onClick={() =>
              kind === "text"
                ? editor.chain().focus().unsetColor().run()
                : editor.chain().focus().unsetHighlight().run()
            }
          >
            Farbe entfernen
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      callout: e.isActive("callout"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  return (
    <Group gap={2} wrap="wrap" className="lt4-toolbar lt4-toolbar-pad">
      <Btn label="Rückgängig" icon={IconArrowBackUp} onClick={() => c().undo().run()} disabled={!s.canUndo} />
      <Btn label="Wiederholen" icon={IconArrowForwardUp} onClick={() => c().redo().run()} disabled={!s.canRedo} />
      <Divider orientation="vertical" mx={4} />
      <Btn label="Überschrift 1" icon={IconH1} active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()} />
      <Btn label="Überschrift 2" icon={IconH2} active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
      <Btn label="Überschrift 3" icon={IconH3} active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
      <Divider orientation="vertical" mx={4} />
      <Btn label="Fett (Strg+B)" icon={IconBold} active={s.bold} onClick={() => c().toggleBold().run()} />
      <Btn label="Kursiv (Strg+I)" icon={IconItalic} active={s.italic} onClick={() => c().toggleItalic().run()} />
      <Btn label="Unterstrichen (Strg+U)" icon={IconUnderline} active={s.underline} onClick={() => c().toggleUnderline().run()} />
      <Btn label="Durchgestrichen" icon={IconStrikethrough} active={s.strike} onClick={() => c().toggleStrike().run()} />
      <Btn label="Code" icon={IconCode} active={s.code} onClick={() => c().toggleCode().run()} />
      <ColorButton editor={editor} kind="text" />
      <ColorButton editor={editor} kind="highlight" />
      <Popover position="bottom" withinPortal shadow="md">
        <Popover.Target>
          <ActionIcon
            variant={s.link ? "light" : "subtle"}
            color={s.link ? "blue" : "gray"}
            aria-label="Link"
            onMouseDown={(e) => e.preventDefault()}
          >
            <IconLink size={18} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <TextInput
            w={260}
            placeholder="https://… (leer = Link entfernen)"
            defaultValue={editor.getAttributes("link").href ?? ""}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const href = e.currentTarget.value.trim();
              if (!href) c().extendMarkRange("link").unsetLink().run();
              else c().extendMarkRange("link").setLink({ href }).run();
            }}
          />
        </Popover.Dropdown>
      </Popover>
      <Divider orientation="vertical" mx={4} />
      <Btn label="Aufzählung" icon={IconList} active={s.bullet} onClick={() => c().toggleBulletList().run()} />
      <Btn label="Nummerierung" icon={IconListNumbers} active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
      <Btn label="Aufgabenliste" icon={IconListCheck} active={s.task} onClick={() => c().toggleTaskList().run()} />
      <Btn label="Zitat" icon={IconBlockquote} active={s.quote} onClick={() => c().toggleBlockquote().run()} />
      <Btn label="Codeblock" icon={IconSourceCode} active={s.codeBlock} onClick={() => c().toggleCodeBlock().run()} />
      <Btn label="Infobox" icon={IconInfoCircle} active={s.callout} onClick={() => c().toggleCallout({ type: "info" } as any).run()} />
      <Btn label="Aufklappbarer Bereich" icon={IconLayoutBottombarCollapse} onClick={() => c().setDetails().run()} />
      <Btn label="Trennlinie" icon={IconSeparatorHorizontal} onClick={() => c().setHorizontalRule().run()} />
      <Btn label="Bild einfügen" icon={IconPhoto} onClick={onImage} />
      <Menu withinPortal position="bottom-start">
        <Menu.Target>
          <ActionIcon variant={s.table ? "light" : "subtle"} color={s.table ? "blue" : "gray"} aria-label="Tabelle" onMouseDown={(e) => e.preventDefault()}>
            <IconTable size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Tabelle 3×3 einfügen</Menu.Item>
          <Menu.Divider />
          <Menu.Item disabled={!s.table} onClick={() => c().addRowAfter().run()}>Zeile darunter</Menu.Item>
          <Menu.Item disabled={!s.table} onClick={() => c().addColumnAfter().run()}>Spalte rechts</Menu.Item>
          <Menu.Item disabled={!s.table} onClick={() => c().deleteRow().run()}>Zeile löschen</Menu.Item>
          <Menu.Item disabled={!s.table} onClick={() => c().deleteColumn().run()}>Spalte löschen</Menu.Item>
          <Menu.Item disabled={!s.table} color="red" onClick={() => c().deleteTable().run()}>Tabelle löschen</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Divider orientation="vertical" mx={4} />
      <Btn label="Linksbündig" icon={IconAlignLeft} active={s.left} onClick={() => c().setTextAlign("left").run()} />
      <Btn label="Zentriert" icon={IconAlignCenter} active={s.center} onClick={() => c().setTextAlign("center").run()} />
      <Btn label="Rechtsbündig" icon={IconAlignRight} active={s.right} onClick={() => c().setTextAlign("right").run()} />
    </Group>
  );
}

function LoadedEditor({ page, doc }: { page: PageMeta; doc: PmDoc }) {
  const store = useStore();
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<PmDoc | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);

  const flush = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const d = pending.current;
    pending.current = null;
    if (d) {
      try {
        await saveDoc(page.id, d);
      } catch (e) {
        notifications.show({ color: "red", title: "Speichern fehlgeschlagen", message: errorText(e) });
      }
    }
  };

  const editor = useEditor(
    {
      extensions: [...buildExtensions({ placeholder: "Schreib los oder tippe „/“ für Blöcke …" }), SlashCommand],
      content: doc,
      immediatelyRender: true,
      editorProps: { attributes: { class: "lt4-prose", spellcheck: "true" } },
      onUpdate: ({ editor: e }) => {
        pending.current = e.getJSON() as PmDoc;
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          flush();
          store.touchPage(page.id);
        }, 600);
      },
    },
    [page.id],
  );

  // "/"-Menü › Bild: Dateiauswahl öffnen
  useEffect(() => {
    const open = () => fileInput.current?.click();
    window.addEventListener(INSERT_IMAGE_EVENT, open);
    return () => window.removeEventListener(INSERT_IMAGE_EVENT, open);
  }, []);

  // "/"-Menü › Datenbank: als Unterseite anlegen und hier einbetten
  useEffect(() => {
    const insert = async (ev: Event) => {
      if (!editor) return;
      const template = (ev as CustomEvent).detail ?? "table";
      try {
        const title = template === "kanban" ? "Kanban-Board" : template === "calendar" ? "Kalender" : "Tabelle";
        const base = await store.createBase(page.spaceId, page.id, template, title);
        (editor.chain().focus() as any).insertBaseEmbed({ pageId: base.id }).run();
      } catch (e) {
        notifications.show({ color: "red", message: errorText(e) });
      }
    };
    window.addEventListener(INSERT_BASE_EVENT, insert);
    return () => window.removeEventListener(INSERT_BASE_EVENT, insert);
  }, [editor, page.id, page.spaceId, store.createBase]);

  // Beim Seitenwechsel oder Schließen ausstehende Änderungen sichern.
  useEffect(() => () => void flush(), [page.id]);

  const insertImages = async (list: FileList | null) => {
    if (!list || !editor) return;
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const { meta, src } = await store.addAttachment(page.id, file);
        editor
          .chain()
          .focus()
          .insertContent({ type: "image", attrs: { src, attachmentId: meta.id, alt: meta.fileName } })
          .run();
      } catch (e) {
        notifications.show({ color: "red", title: "Bild konnte nicht gespeichert werden", message: errorText(e) });
      }
    }
  };

  if (!editor) return null;
  return (
    <Stack gap="xs" className="lt4-editor">
      <Toolbar editor={editor} onImage={() => fileInput.current?.click()} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          insertImages(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <div
        ref={setWrap}
        style={{ position: "relative" }}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length) {
            e.preventDefault();
            insertImages(e.dataTransfer.files);
          }
        }}
        onPaste={(e) => {
          const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (imgs.length) {
            e.preventDefault();
            const dt = new DataTransfer();
            imgs.forEach((f) => dt.items.add(f));
            insertImages(dt.files);
          }
        }}
      >
        <EditorContent editor={editor} />
        <ColumnsMenu editor={editor} container={wrap} />
        <TableMenu editor={editor} container={wrap} />
      </div>
    </Stack>
  );
}

export function PageEditor({ page }: { page: PageMeta }) {
  const [doc, setDoc] = useState<PmDoc | null>(null);
  useEffect(() => {
    let alive = true;
    setDoc(null);
    loadDoc(page.id).then((d) => alive && setDoc(d));
    return () => {
      alive = false;
    };
  }, [page.id]);
  if (!doc) return <Loader size="sm" />;
  return <LoadedEditor key={page.id} page={page} doc={doc} />;
}
