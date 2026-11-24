// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Knopf "Mit … anmelden" für LDAP-Anbieter; öffnet ein Formular für Name und Passwort.
import { useState } from "react";
import { Button, Modal, PasswordInput, Stack, TextInput } from "@mantine/core";
import { IconBuildingCommunity } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import APP_ROUTE, { getPostLoginRedirect } from "@/lib/app-route.ts";
import { ldapLogin } from "./ldap-service";

export function LdapLoginButton({ provider }: { provider: { id: string; name: string } }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    try {
      const res = await ldapLogin(provider.id, username, password);
      if (res?.userHasMfa) navigate(APP_ROUTE.AUTH.MFA_CHALLENGE + window.location.search);
      else if (res?.requiresMfaSetup) navigate(APP_ROUTE.AUTH.MFA_SETUP_REQUIRED + window.location.search);
      else navigate(getPostLoginRedirect());
    } catch (err: any) {
      const m = err?.response?.data?.message;
      notifications.show({ message: t((Array.isArray(m) ? m[0] : m) ?? "Error"), color: "red" });
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="default"
        fullWidth
        leftSection={<IconBuildingCommunity size={18} />}
        onClick={() => setOpened(true)}
      >
        {t("Continue with {{name}}", { name: provider.name })}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={t("Sign in with {{name}}", { name: provider.name })}
        centered
        size="sm"
      >
        <form onSubmit={submit}>
          <Stack gap="sm">
            <TextInput
              label={t("Username or email")}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              data-autofocus
              required
            />
            <PasswordInput
              label={t("Password")}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" loading={busy} mt="xs">
              {t("Sign in")}
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
