// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Status-Badge (Knoten "status", Attribute text + color) wie in der Web-Version.
import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Box, Group, Popover, TextInput } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import classes from "../../../client/src/features/editor/components/status/status.module.css";

const COLORS: { name: string; cls: string; bg: string }[] = [
  { name: "gray", cls: classes.colorGray, bg: "rgb(223 223 215)" },
  { name: "blue", cls: classes.colorBlue, bg: "rgb(191 227 253)" },
  { name: "green", cls: classes.colorGreen, bg: "rgb(187 240 173)" },
  { name: "yellow", cls: classes.colorYellow, bg: "rgb(249 238 148)" },
  { name: "red", cls: classes.colorRed, bg: "rgb(255 200 195)" },
  { name: "purple", cls: classes.colorPurple, bg: "rgb(225 207 245)" },
];

export default function StatusView({ node, updateAttributes, editor, getPos, selected, deleteNode }: NodeViewProps) {
  const text: string = node.attrs.text ?? "";
  const color: string = node.attrs.color ?? "gray";
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    const storage = (editor.storage as any).status;
    if (storage?.autoOpen && !text && editor.isEditable) {
      storage.autoOpen = false;
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

  const close = () => {
    setOpened(false);
    if (!draft.trim()) {
      deleteNode();
      return;
    }
    if (draft !== text) updateAttributes({ text: draft });
  };

  const colorCls = COLORS.find((c) => c.name === color)?.cls ?? classes.colorGray;

  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }} data-drag-handle>
      <Popover opened={opened && editor.isEditable} onClose={close} width={220} position="bottom" withArrow shadow="md" trapFocus>
        <Popover.Target>
          <span
            className={`status-badge ${classes.status} ${colorCls}`}
            role="button"
            onClick={() => {
              if (!editor.isEditable) return;
              setDraft(text);
              setOpened(true);
            }}
          >
            {text || "STATUS"}
          </span>
        </Popover.Target>
        <Popover.Dropdown>
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                close();
                const pos = getPos();
                if (typeof pos === "number") editor.commands.focus(pos + node.nodeSize);
              }
            }}
            placeholder="Statustext"
            size="sm"
            mb="xs"
            data-autofocus
          />
          <Group gap={6} justify="center">
            {COLORS.map((c) => (
              <Box
                key={c.name}
                className={`${classes.swatch} ${color === c.name ? classes.swatchActive : ""}`}
                style={{ backgroundColor: c.bg }}
                role="button"
                aria-label={c.name}
                onClick={() => updateAttributes({ color: c.name })}
              >
                {color === c.name && <IconCheck size={14} />}
              </Box>
            ))}
          </Group>
        </Popover.Dropdown>
      </Popover>
    </NodeViewWrapper>
  );
}
