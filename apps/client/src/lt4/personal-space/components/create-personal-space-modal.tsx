// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getSpaceUrl } from "@/lib/config.ts";
import { createPersonalSpace, PERSONAL_SPACE_KEY } from "../queries/personal-space-query";

export default function CreatePersonalSpaceModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const space = await createPersonalSpace(name.trim() || undefined);
      queryClient.setQueryData(PERSONAL_SPACE_KEY, space);
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      onClose();
      setName("");
      navigate(getSpaceUrl(space.slug));
    } catch (err: any) {
      notifications.show({
        message: t(err?.response?.data?.message ?? "Error"),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Create personal space")}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t("Your personal space is only visible to you. Use it for notes and drafts. You can move pages into shared spaces later.")}
        </Text>
        <TextInput
          label={t("Name")}
          placeholder={t("Personal space")}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} loading={busy}>
            {t("Create")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
