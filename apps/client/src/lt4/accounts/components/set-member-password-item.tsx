// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import { Button, Menu, PasswordInput, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconKey } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { setMemberPassword } from "../join-link-service";

interface Props {
  userId: string;
  name: string;
  disabled?: boolean;
}

/** Admins setzen ein neues Passwort, z. B. für Konten ohne E-Mail (kein Reset per Mail möglich). */
export function SetMemberPasswordItem({ userId, name, disabled }: Props) {
  const { t } = useTranslation();
  const open = () => {
    const id = `lt4-set-password-${userId}`;
    modals.open({
      modalId: id,
      title: t("Set password"),
      centered: true,
      children: (
        <SetPasswordForm userId={userId} name={name} onDone={() => modals.close(id)} />
      ),
    });
  };
  return (
    <Menu.Item leftSection={<IconKey size={16} />} onClick={open} disabled={disabled}>
      {t("Set password")}
    </Menu.Item>
  );
}

function SetPasswordForm({
  userId,
  name,
  onDone,
}: {
  userId: string;
  name: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return;
    setBusy(true);
    try {
      await setMemberPassword(userId, password);
      notifications.show({ message: t("Password has been changed") });
      onDone();
    } catch (err) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <Text size="sm">
          {t(
            "Sets a new password for {{name}} and signs them out on all devices. Pass the password on to them in person.",
            { name },
          )}
        </Text>
        <PasswordInput
          label={t("New password")}
          description={t("At least 8 characters")}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="new-password"
          autoFocus
        />
        <Button type="submit" loading={busy} disabled={password.length < 8}>
          {t("Set password")}
        </Button>
      </Stack>
    </form>
  );
}
