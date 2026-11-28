// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Eingebettete Datenbank (Knoten "base", Attribut pageId) wie in der Web-Version.
// Zeigt die lokale Datenbank-Seite mit Tabelle/Kanban/Kalender direkt im Text.
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ActionIcon, Alert, Group, Text, Tooltip } from "@mantine/core";
import { IconTable, IconX } from "@tabler/icons-react";
import { BaseView } from "../../../client/src/lt4/base/components/base-view";
import { useStore } from "../lib/store";

export default function BaseEmbedView({ node, editor, deleteNode }: NodeViewProps) {
  const store = useStore();
  const pageId = node.attrs.pageId as string | null;
  const page = pageId ? store.state.pages.find((p) => p.id === pageId && p.isBase) : undefined;

  return (
    <NodeViewWrapper className="lt4-base-embed" data-drag-handle contentEditable={false}>
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap={6} wrap="nowrap">
          <IconTable size={16} />
          <Text fw={600} size="sm" truncate>
            {page ? page.title || "Unbenannte Datenbank" : "Datenbank"}
          </Text>
        </Group>
        {editor.isEditable && (
          <Tooltip label="Einbettung entfernen (die Datenbank bleibt als Seite erhalten)">
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Einbettung entfernen" onClick={() => deleteNode()}>
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {page ? (
        <BaseView pageId={page.id} embedded editable={editor.isEditable} />
      ) : (
        <Alert variant="light" color="gray">
          Diese Datenbank liegt nicht auf diesem Gerät (z. B. nur auf dem Server). Beim Export bleibt der
          Verweis erhalten.
        </Alert>
      )}
    </NodeViewWrapper>
  );
}
