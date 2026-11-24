// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Wer darf den KI-Assistenten nutzen? Alle oder nur freigegebene Gruppen und Personen.
import { useState } from "react";
import { ActionIcon, Button, Group, Radio, Stack, Text } from "@mantine/core";
import { IconUsersGroup, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { MultiGroupSelect } from "@/features/group/components/multi-group-select.tsx";
import { MultiUserSelect } from "@/features/group/components/multi-user-select.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { IAiSettings, IAiSettingsInput } from "@/lt4/ai/services/ai-service";

type Props = {
  data: IAiSettings;
  busy: boolean;
  onUpdate: (input: IAiSettingsInput) => Promise<void>;
};

export function AiAccessSection({ data, busy, onUpdate }: Props) {
  const { t } = useTranslation();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  const groupList = data.allowedGroups.map((g) => g.id);
  const userList = data.allowedUsers.map((u) => u.id);

  const add = async () => {
    await onUpdate({
      allowedGroupIds: [...new Set([...groupList, ...groupIds])],
      allowedUserIds: [...new Set([...userList, ...userIds])],
    });
    setGroupIds([]);
    setUserIds([]);
    setResetKey((k) => k + 1);
  };

  return (
    <>
      <Radio.Group
        label={t("Who can use the AI assistant?")}
        value={data.access}
        onChange={(v) => onUpdate({ access: v as "all" | "restricted" })}
      >
        <Stack mt="xs" gap="xs">
          <Radio value="all" label={t("All members")} disabled={busy} />
          <Radio
            value="restricted"
            label={t("Only selected groups and people")}
            description={t("Admins can always use it.")}
            disabled={busy}
          />
        </Stack>
      </Radio.Group>

      {data.access === "restricted" && (
        <Stack mt="md" gap="xs">
          <Group align="flex-end" gap="sm" wrap="wrap" key={resetKey}>
            <div style={{ flex: "1 1 220px" }}>
              <MultiGroupSelect label={t("Add groups")} onChange={setGroupIds} />
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <MultiUserSelect label={t("Add people")} onChange={setUserIds} />
            </div>
            <Button
              onClick={add}
              loading={busy}
              disabled={!groupIds.length && !userIds.length}
            >
              {t("Add")}
            </Button>
          </Group>

          {!data.allowedGroups.length && !data.allowedUsers.length && (
            <Text size="sm" c="dimmed">
              {t("Nobody is approved yet. Only admins can use the AI assistant.")}
            </Text>
          )}

          {data.allowedGroups.map((g) => (
            <Group key={g.id} justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <IconUsersGroup size={20} stroke={1.5} />
                <Text size="sm">{g.name}</Text>
              </Group>
              <ActionIcon
                variant="subtle"
                color="gray"
                disabled={busy}
                aria-label={t("Remove")}
                onClick={() =>
                  onUpdate({ allowedGroupIds: groupList.filter((id) => id !== g.id) })
                }
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ))}
          {data.allowedUsers.map((u) => (
            <Group key={u.id} justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <CustomAvatar avatarUrl={u.avatarUrl} name={u.name} size={24} />
                <div>
                  <Text size="sm">{u.name}</Text>
                  {u.email && (
                    <Text size="xs" c="dimmed">
                      {u.email}
                    </Text>
                  )}
                </div>
              </Group>
              <ActionIcon
                variant="subtle"
                color="gray"
                disabled={busy}
                aria-label={t("Remove")}
                onClick={() =>
                  onUpdate({ allowedUserIds: userList.filter((id) => id !== u.id) })
                }
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}
    </>
  );
}
