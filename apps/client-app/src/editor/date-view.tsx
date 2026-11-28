// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Datum (Knoten "date", Attribut date = JJJJ-MM-TT). Klick öffnet einen Datumswähler.
import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Popover, TextInput } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import { formatDateLabel } from "@docmost/editor-ext";

export default function DateView({ node, updateAttributes, editor }: NodeViewProps) {
  const value: string | null = node.attrs.date;
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const storage = (editor.storage as any).date;
    if (storage?.justInserted && storage.justInserted === node) {
      storage.justInserted = null;
      setOpened(true);
    }
  }, []);

  const label = formatDateLabel(value, "de-DE") || "Datum";

  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }} data-drag-handle>
      <Popover opened={opened && editor.isEditable} onChange={setOpened} position="bottom" withArrow shadow="md" trapFocus>
        <Popover.Target>
          <time
            dateTime={value ?? undefined}
            className="lt4-date"
            onClick={() => editor.isEditable && setOpened(true)}
          >
            <IconCalendar size={14} style={{ verticalAlign: "-2px", marginRight: 3 }} />
            {label}
          </time>
        </Popover.Target>
        <Popover.Dropdown>
          <TextInput
            type="date"
            value={value ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(v)) updateAttributes({ date: v });
            }}
            onKeyDown={(e) => e.key === "Enter" && setOpened(false)}
            data-autofocus
          />
        </Popover.Dropdown>
      </Popover>
    </NodeViewWrapper>
  );
}
