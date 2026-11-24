// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IBaseProperty, IBaseRow } from "../types/base.types";
import { BaseActions } from "../queries/base-query";
import { BaseCell } from "./cells/base-cell";
import { PropertyIcon } from "./cells/property-icon";

interface Props {
  row: IBaseRow | null;
  properties: IBaseProperty[];
  editable: boolean;
  actions: BaseActions;
  onClose: () => void;
}

/** Eine Zeile mit allen Eigenschaften (auch Karten im Kanban und Kalender). */
export function RowModal({ row, properties, editable, actions, onClose }: Props) {
  const { t } = useTranslation();
  const primary = properties.find((p) => p.isPrimary) ?? properties[0];
  const [title, setTitle] = useState("");
  useEffect(() => {
    setTitle(row && primary ? String(row.cells[primary.id] ?? "") : "");
    // Nur beim Öffnen einer anderen Zeile übernehmen, nicht bei jedem Abgleich.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  const saveTitle = () => {
    if (!row || !primary) return;
    const current = String(row.cells[primary.id] ?? "");
    if (title !== current) actions.updateCells(row.id, { [primary.id]: title.trim() ? title : null });
  };

  return (
    <Modal
      opened={!!row}
      onClose={() => {
        saveTitle();
        onClose();
      }}
      size="lg"
      withCloseButton
      title={null}
      padding="lg"
    >
      {row && (
        <Stack gap="md">
          <Textarea
            variant="unstyled"
            autosize
            minRows={1}
            placeholder={t("Untitled")}
            value={title}
            readOnly={!editable}
            onChange={(e) => setTitle(e.currentTarget.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveTitle();
              }
            }}
            styles={{ input: { fontSize: 26, fontWeight: 700, lineHeight: 1.25 } }}
            aria-label={primary?.name}
          />
          <Stack gap={2}>
            {properties
              .filter((p) => p.id !== primary?.id)
              .map((prop) => (
                <Group key={prop.id} gap="sm" wrap="nowrap" align="flex-start">
                  <Group gap={6} w={170} wrap="nowrap" style={{ flexShrink: 0 }} mt={7} c="dimmed">
                    <PropertyIcon type={prop.type} />
                    <Text size="sm" truncate>
                      {prop.name}
                    </Text>
                  </Group>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <BaseCell
                      prop={prop}
                      value={row.cells[prop.id]}
                      editable={editable}
                      actions={actions}
                      variant="field"
                      onChange={(value) => actions.updateCells(row.id, { [prop.id]: value })}
                    />
                  </div>
                </Group>
              ))}
          </Stack>
          {editable && (
            <Group justify="flex-end">
              <Button
                variant="subtle"
                color="red"
                size="xs"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  actions.deleteRows([row.id]);
                  onClose();
                }}
              >
                {t("Delete row")}
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
