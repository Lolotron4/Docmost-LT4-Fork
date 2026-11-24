// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Sicherheit: LDAP-Verzeichnisse für die Anmeldung verwalten.
import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconBuildingCommunity,
  IconPencil,
  IconPlugConnected,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createLdapProvider,
  deleteLdapProvider,
  ILdapProvider,
  ILdapTestResult,
  listLdapProviders,
  testLdapProvider,
  updateLdapProvider,
} from "./ldap-service";

const KEY = ["lt4-ldap-providers"];
const DEFAULT_FILTER = "(|(uid={{username}})(mail={{username}}))";

const errorText = (err: any) => {
  const m = err?.response?.data?.message;
  return Array.isArray(m) ? m[0] : m;
};

type FormState = {
  name: string;
  url: string;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userSearchFilter: string;
  usernameAttribute: string;
  emailAttribute: string;
  nameAttribute: string;
  startTls: boolean;
  caCert: string;
  allowSignup: boolean;
};

const emptyForm: FormState = {
  name: "LDAP",
  url: "ldap://",
  bindDn: "",
  bindPassword: "",
  baseDn: "",
  userSearchFilter: DEFAULT_FILTER,
  usernameAttribute: "uid",
  emailAttribute: "mail",
  nameAttribute: "cn",
  startTls: false,
  caCert: "",
  allowSignup: false,
};

export function LdapProvidersSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: listLdapProviders });
  const [editing, setEditing] = useState<ILdapProvider | "new" | null>(null);
  const providers = data?.items ?? [];
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ["workspace-public"] });
  };

  const toggle = async (p: ILdapProvider, isEnabled: boolean) => {
    try {
      await updateLdapProvider({ id: p.id, isEnabled });
      refresh();
    } catch (err) {
      notifications.show({ message: t(errorText(err) ?? "Error"), color: "red" });
    }
  };

  const remove = (p: ILdapProvider) =>
    modals.openConfirmModal({
      title: t("Delete sign-in provider"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Members can no longer sign in with {{name}}. Their accounts remain and can still be used with a password.",
            { name: p.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteLdapProvider(p.id);
          refresh();
        } catch (err) {
          notifications.show({ message: t(errorText(err) ?? "Error"), color: "red" });
        }
      },
    });

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text size="md">{t("LDAP directory")}</Text>
          <Text size="sm" c="dimmed">
            {t("Let members sign in with their school or company account from an LDAP server (e.g. OpenLDAP, Active Directory).")}
          </Text>
        </div>
        <Button
          variant="default"
          leftSection={<IconPlus size={16} />}
          onClick={() => setEditing("new")}
          style={{ flexShrink: 0 }}
        >
          {t("Add LDAP")}
        </Button>
      </Group>

      {providers.map((p) => (
        <Group
          key={p.id}
          justify="space-between"
          wrap="nowrap"
          p="sm"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-md)",
          }}
        >
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <IconBuildingCommunity size={22} stroke={1.5} />
            <div style={{ minWidth: 0 }}>
              <Group gap={6}>
                <Text size="sm" fw={500}>
                  {p.name}
                </Text>
                <Badge size="xs" variant="light" color="gray">
                  LDAP
                </Badge>
                {p.allowSignup && (
                  <Badge size="xs" variant="light">
                    {t("Sign-up allowed")}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {p.url} · {p.baseDn}
              </Text>
            </div>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Switch
              checked={p.isEnabled}
              onChange={(e) => toggle(p, e.currentTarget.checked)}
              aria-label={t("Enabled")}
              mr="xs"
            />
            <Tooltip label={t("Edit")} withArrow>
              <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(p)} aria-label={t("Edit")}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Delete")} withArrow>
              <ActionIcon variant="subtle" color="red" onClick={() => remove(p)} aria-label={t("Delete")}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      ))}

      <LdapModal provider={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </Stack>
  );
}

function LdapModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: ILdapProvider | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const existing = provider && provider !== "new" ? provider : null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testUser, setTestUser] = useState("");
  const [testResult, setTestResult] = useState<ILdapTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const openKey = provider === "new" ? "new" : existing?.id ?? null;
  if (openKey !== loadedFor) {
    setLoadedFor(openKey);
    setTestResult(null);
    setTestUser("");
    setSavedId(existing?.id ?? null);
    setForm(
      existing
        ? {
            name: existing.name,
            url: existing.url,
            bindDn: existing.bindDn ?? "",
            bindPassword: "",
            baseDn: existing.baseDn,
            userSearchFilter: existing.userSearchFilter,
            usernameAttribute: existing.usernameAttribute,
            emailAttribute: existing.emailAttribute,
            nameAttribute: existing.nameAttribute,
            startTls: existing.startTls,
            caCert: existing.caCert ?? "",
            allowSignup: existing.allowSignup,
          }
        : emptyForm,
    );
  }

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const isLdaps = form.url.toLowerCase().startsWith("ldaps://");

  /** Speichert und gibt die ID zurück (für den Test vor dem ersten Schließen). */
  const persist = async (): Promise<string | null> => {
    const payload = {
      name: form.name,
      url: form.url,
      bindDn: form.bindDn,
      baseDn: form.baseDn,
      userSearchFilter: form.userSearchFilter,
      usernameAttribute: form.usernameAttribute,
      emailAttribute: form.emailAttribute,
      nameAttribute: form.nameAttribute,
      startTls: isLdaps ? false : form.startTls,
      caCert: form.caCert,
      allowSignup: form.allowSignup,
      ...(form.bindPassword ? { bindPassword: form.bindPassword } : {}),
    };
    try {
      if (savedId) {
        await updateLdapProvider({ id: savedId, ...payload });
        setForm((f) => ({ ...f, bindPassword: "" }));
        onSaved();
        return savedId;
      }
      const created = await createLdapProvider({ ...payload, isEnabled: true });
      setSavedId(created.id);
      setForm((f) => ({ ...f, bindPassword: "" }));
      onSaved();
      return created.id;
    } catch (err) {
      notifications.show({ message: t(errorText(err) ?? "Error"), color: "red" });
      return null;
    }
  };

  const save = async () => {
    setBusy(true);
    const id = await persist();
    setBusy(false);
    if (id) onClose();
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const id = await persist();
    if (id) {
      try {
        setTestResult(await testLdapProvider(id, testUser.trim() || undefined));
      } catch (err) {
        setTestResult({ ok: false, message: errorText(err) ?? "Error" });
      }
    }
    setTesting(false);
  };

  const incomplete = !form.name.trim() || !/^ldaps?:\/\/[^\s/]+/i.test(form.url) || !form.baseDn.trim();

  return (
    <Modal
      opened={!!provider}
      onClose={onClose}
      title={existing ? t("Edit LDAP directory") : t("Add LDAP directory")}
      centered
      size="lg"
    >
      <Stack gap="sm">
        <TextInput
          label={t("Button name")}
          description={t('Shown as "Continue with …" on the login page.')}
          value={form.name}
          onChange={(e) => set("name")(e.currentTarget.value)}
        />
        <TextInput
          label={t("Server URL")}
          description={t("ldap://server:389 or ldaps://server:636")}
          placeholder="ldaps://ldap.schule.de:636"
          value={form.url}
          onChange={(e) => set("url")(e.currentTarget.value)}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label={t("Bind DN (service account)")}
            description={t("Empty for anonymous search")}
            placeholder="cn=docmost,ou=services,dc=schule,dc=de"
            value={form.bindDn}
            onChange={(e) => set("bindDn")(e.currentTarget.value)}
          />
          <PasswordInput
            label={t("Bind password")}
            description={existing?.hasBindPassword ? t("Leave empty to keep it") : " "}
            placeholder={existing?.hasBindPassword ? t("Unchanged") : ""}
            value={form.bindPassword}
            onChange={(e) => set("bindPassword")(e.currentTarget.value)}
          />
        </SimpleGrid>
        <TextInput
          label={t("Base DN for users")}
          placeholder="ou=people,dc=schule,dc=de"
          value={form.baseDn}
          onChange={(e) => set("baseDn")(e.currentTarget.value)}
        />
        <TextInput
          label={t("User search filter")}
          description={t("{{placeholder}} is replaced by what the person types. For Active Directory e.g. (sAMAccountName={{placeholder}}).", { placeholder: "{{username}}" })}
          value={form.userSearchFilter}
          onChange={(e) => set("userSearchFilter")(e.currentTarget.value)}
        />
        <SimpleGrid cols={3}>
          <TextInput
            label={t("Username attribute")}
            value={form.usernameAttribute}
            onChange={(e) => set("usernameAttribute")(e.currentTarget.value)}
          />
          <TextInput
            label={t("Email attribute")}
            value={form.emailAttribute}
            onChange={(e) => set("emailAttribute")(e.currentTarget.value)}
          />
          <TextInput
            label={t("Name attribute")}
            value={form.nameAttribute}
            onChange={(e) => set("nameAttribute")(e.currentTarget.value)}
          />
        </SimpleGrid>
        {!isLdaps && (
          <Switch
            label={t("Use StartTLS")}
            description={t("Encrypts the connection on port 389. Recommended if the server supports it.")}
            checked={form.startTls}
            onChange={(e) => set("startTls")(e.currentTarget.checked)}
          />
        )}
        {(isLdaps || form.startTls) && (
          <Textarea
            label={t("CA certificate (optional)")}
            description={t("Only needed for self-signed certificates. PEM format.")}
            placeholder="-----BEGIN CERTIFICATE-----"
            autosize
            minRows={2}
            maxRows={6}
            value={form.caCert}
            onChange={(e) => set("caCert")(e.currentTarget.value)}
            styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
          />
        )}
        <Switch
          label={t("Allow sign-up")}
          description={t("Everyone in the directory who signs in gets an account. Without it, only existing members (same email) can use it.")}
          checked={form.allowSignup}
          onChange={(e) => set("allowSignup")(e.currentTarget.checked)}
        />

        <Stack gap={6} mt="xs" p="sm" style={{ background: "var(--mantine-color-default-hover)", borderRadius: "var(--mantine-radius-md)" }}>
          <Text size="sm" fw={500}>
            {t("Test connection")}
          </Text>
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              size="xs"
              placeholder={t("Optional: username to look up")}
              value={testUser}
              onChange={(e) => setTestUser(e.currentTarget.value)}
            />
            <Button
              size="xs"
              variant="default"
              leftSection={<IconPlugConnected size={14} />}
              onClick={test}
              loading={testing}
              disabled={incomplete}
            >
              {t("Save and test")}
            </Button>
          </Group>
          {testResult && (
            <Alert variant="light" color={testResult.ok ? "green" : "red"} p="xs">
              <Text size="sm">{t(testResult.message)}</Text>
              {testResult.user && (
                <Text size="xs" c="dimmed" mt={4}>
                  {[testResult.user.name, testResult.user.email, testResult.user.dn].filter(Boolean).join(" · ")}
                </Text>
              )}
            </Alert>
          )}
        </Stack>

        <Button mt="xs" onClick={save} loading={busy} disabled={incomplete}>
          {t("Save")}
        </Button>
      </Stack>
    </Modal>
  );
}
