// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Registerkarten (Knoten tabs/tab/tabLabel/tabPanel aus @docmost/editor-ext).
// Vereinfachte Ansicht: Reiter wechseln, hinzufügen, per Doppelklick umbenennen,
// verschieben und löschen. Gleiches Aussehen wie die Web-Version (tabs.css).
import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconChevronDown,
  IconCopy,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { getShownTabIndex } from "@docmost/editor-ext";

export default function TabsView({ node, editor, getPos, innerDecorations }: NodeViewProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const editable = editor.isEditable;
  const active = getShownTabIndex(node, innerDecorations);
  const labels = Array.from({ length: node.childCount }, (_, i) => node.child(i).firstChild?.textContent ?? "");

  const at = (run: (pos: number) => void) => {
    const pos = getPos();
    if (typeof pos === "number") run(pos);
  };

  const startRename = (i: number) => {
    setDraft(labels[i] ?? `Tab ${i + 1}`);
    setRenaming(i);
  };
  const finishRename = (i: number, save: boolean) => {
    setRenaming(null);
    const next = draft.trim();
    if (save && next && next !== labels[i]) at((pos) => editor.commands.renameTab(i, next, pos));
  };

  return (
    <NodeViewWrapper data-type="tabs" className="dm-tabs">
      <div className="dm-tabs__header" contentEditable={false} data-tab-strip>
        <div className="dm-tabs__tabs" style={{ overflowX: "auto" }}>
          <div className="dm-tabs__list" role="tablist">
            {labels.map((label, i) => (
              <div key={node.child(i).attrs.id || i} className="dm-tabs__slot" data-active={i === active || undefined} data-tab-index={i}>
                {renaming === i ? (
                  <span className="dm-tabs__rename" data-value={draft}>
                    <input
                      size={1}
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.currentTarget.value)}
                      onBlur={() => finishRename(i, true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") finishRename(i, true);
                        if (e.key === "Escape") finishRename(i, false);
                        e.stopPropagation();
                      }}
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    role="tab"
                    className="dm-tabs__tab"
                    data-active={i === active || undefined}
                    aria-selected={i === active}
                    onClick={() => at((pos) => editor.commands.setActiveTab(i, pos))}
                    onDoubleClick={() => editable && startRename(i)}
                  >
                    {label || "Unbenannt"}
                  </button>
                )}
                {editable && i === active && renaming === null && (
                  <Menu position="bottom-start" withinPortal shadow="md">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" size="xs" aria-label="Reiter-Aktionen">
                        <IconChevronDown size={14} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => startRename(i)}>
                        Umbenennen
                      </Menu.Item>
                      <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => at((p) => editor.commands.duplicateTab(i, p))}>
                        Duplizieren
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconArrowLeft size={14} />}
                        disabled={i === 0}
                        onClick={() => at((p) => editor.commands.moveTab(i, i - 1, p))}
                      >
                        Nach links
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconArrowRight size={14} />}
                        disabled={i === labels.length - 1}
                        onClick={() => at((p) => editor.commands.moveTab(i, i + 1, p))}
                      >
                        Nach rechts
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => at((p) => editor.commands.deleteTab(i, p))}>
                        {labels.length === 1 ? "Registerkarten entfernen" : "Reiter löschen"}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </div>
            ))}
          </div>
        </div>
        {editable && (
          <div className="dm-tabs__actions">
            <Tooltip label="Reiter hinzufügen">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Reiter hinzufügen"
                onClick={() =>
                  at((pos) => {
                    if (editor.commands.addTab(pos)) startRename(labels.length);
                  })
                }
              >
                <IconPlus size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>
      <NodeViewContent className="dm-tabs__content" />
    </NodeViewWrapper>
  );
}
