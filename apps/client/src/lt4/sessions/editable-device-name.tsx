// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import { ActionIcon, Group, Text, TextInput, Tooltip } from "@mantine/core";
import { IconCheck, IconPencil, IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";

interface Props {
  sessionId: string;
  deviceName: string | null;
}

/** Gerätename in der Sitzungsliste, per Stift-Symbol umbenennbar. */
export function EditableDeviceName({ sessionId, deviceName }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(deviceName ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const name = value.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.post("/sessions/rename", { sessionId, name });
      await queryClient.invalidateQueries({ queryKey: ["session-list"] });
      setEditing(false);
    } catch (err) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <Group gap={4} wrap="nowrap">
        <TextInput
          size="xs"
          value={value}
          maxLength={60}
          autoFocus
          placeholder={t("e.g. School laptop")}
          aria-label={t("Device Name")}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <ActionIcon size="sm" variant="subtle" color="teal" loading={busy} onClick={save} aria-label={t("Save")}>
          <IconCheck size={16} />
        </ActionIcon>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setEditing(false)} aria-label={t("Cancel")}>
          <IconX size={16} />
        </ActionIcon>
      </Group>
    );
  }

  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm">{deviceName || t("Unknown device")}</Text>
      <Tooltip label={t("Rename device")} withArrow>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={t("Rename device")}
          onClick={() => {
            setValue(deviceName ?? "");
            setEditing(true);
          }}
        >
          <IconPencil size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
