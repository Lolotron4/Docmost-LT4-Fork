// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import {
  createSsoProvider,
  deleteSsoProvider,
  ISsoProvider,
  listSsoProviders,
  SsoPreset,
  updateSsoProvider,
} from "./sso-service";
import { ProviderIcon } from "./provider-icon";

const KEY = ["lt4-sso-providers"];

const PRESET_LABEL: Record<SsoPreset, string> = {
  discord: "Discord",
  google: "Google",
  microsoft: "Microsoft",
  oidc: "OpenID Connect",
};

const errorText = (err: any) => {
  const m = err?.response?.data?.message;
  return Array.isArray(m) ? m[0] : m;
};

export function SsoProvidersSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { data } = useQuery({ queryKey: KEY, queryFn: listSsoProviders });
  const [editing, setEditing] = useState<ISsoProvider | "new" | null>(null);
  const providers = data?.items ?? [];
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ["workspace-public"] });
  };

  const toggle = async (provider: ISsoProvider, isEnabled: boolean) => {
    try {
      await updateSsoProvider({ id: provider.id, isEnabled });
      refresh();
    } catch (err) {
      notifications.show({ message: t(errorText(err) ?? "Error"), color: "red" });
    }
  };

  const remove = (provider: ISsoProvider) =>
    modals.openConfirmModal({
      title: t("Delete sign-in provider"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Members can no longer sign in with {{name}}. Their accounts remain and can still be used with a password.",
            { name: provider.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteSsoProvider(provider.id);
          refresh();
        } catch (err) {
          notifications.show({ message: t(errorText(err) ?? "Error"), color: "red" });
        }
      },
    });

  const setEnforce = async (value: boolean) => {
    try {
      setWorkspace(await updateWorkspace({ enforceSso: value }));
    } catch (err) {
      notifications.show({ message: t(errorText(err) ?? "Error"), color: "red" });
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text size="md">{t("Single sign-on (SSO)")}</Text>
          <Text size="sm" c="dimmed">
            {t("Let members sign in with Discord, Google, Microsoft or your own OpenID Connect server.")}
          </Text>
        </div>
        <Button
          variant="default"
          leftSection={<IconPlus size={16} />}
          onClick={() => setEditing("new")}
          style={{ flexShrink: 0 }}
        >
          {t("Add provider")}
        </Button>
      </Group>

      {providers.map((provider) => (
        <Group
          key={provider.id}
          justify="space-between"
          wrap="nowrap"
          p="sm"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-md)",
          }}
        >
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ProviderIcon preset={provider.preset} size={22} />
            <div style={{ minWidth: 0 }}>
              <Group gap={6}>
                <Text size="sm" fw={500}>
                  {provider.name}
                </Text>
                <Badge size="xs" variant="light" color="gray">
                  {PRESET_LABEL[provider.preset]}
                </Badge>
                {provider.allowSignup && (
                  <Badge size="xs" variant="light">
                    {t("Sign-up allowed")}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {provider.callbackUrl}
              </Text>
            </div>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Switch
              checked={provider.isEnabled}
              onChange={(e) => toggle(provider, e.currentTarget.checked)}
              aria-label={t("Enabled")}
              mr="xs"
            />
            <Tooltip label={t("Edit")} withArrow>
              <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(provider)} aria-label={t("Edit")}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Delete")} withArrow>
              <ActionIcon variant="subtle" color="red" onClick={() => remove(provider)} aria-label={t("Delete")}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      ))}

      {providers.some((p) => p.isEnabled) && (
        <Group justify="space-between" wrap="nowrap" gap="xl" mt="xs">
          <div>
            <Text size="md">{t("Enforce SSO")}</Text>
            <Text size="sm" c="dimmed">
              {t("Once enforced, members will not be able to login with email and password.")}
            </Text>
          </div>
          <Switch
            checked={!!workspace?.enforceSso}
            onChange={(e) => setEnforce(e.currentTarget.checked)}
            aria-label={t("Toggle sso enforcement")}
          />
        </Group>
      )}

      <ProviderModal
        provider={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    </Stack>
  );
}

function ProviderModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: ISsoProvider | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isNew = provider === "new";
  const existing = provider && provider !== "new" ? provider : null;
  const [preset, setPreset] = useState<SsoPreset>("discord");
  const [form, setForm] = useState({
    name: "",
    issuer: "",
    tenant: "",
    clientId: "",
    clientSecret: "",
    allowSignup: false,
  });
  const [createdCallback, setCreatedCallback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Formular beim Öffnen befüllen.
  const openKey = isNew ? "new" : existing?.id ?? null;
  if (openKey !== loadedFor) {
    setLoadedFor(openKey);
    setCreatedCallback(null);
    if (existing) {
      setPreset(existing.preset);
      setForm({
        name: existing.name,
        issuer: existing.issuer ?? "",
        tenant: existing.tenant ?? "",
        clientId: existing.clientId,
        clientSecret: "",
        allowSignup: existing.allowSignup,
      });
    } else if (isNew) {
      setPreset("discord");
      setForm({ name: "Discord", issuer: "", tenant: "", clientId: "", clientSecret: "", allowSignup: false });
    }
  }

  const set = (key: keyof typeof form) => (value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const changePreset = (value: SsoPreset) => {
    setPreset(value);
    if (!form.name || Object.values(PRESET_LABEL).includes(form.name)) {
      setForm((f) => ({ ...f, name: value === "oidc" ? "" : PRESET_LABEL[value] }));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        clientId: form.clientId,
        allowSignup: form.allowSignup,
        ...(preset === "oidc" ? { issuer: form.issuer } : {}),
        ...(preset === "microsoft" ? { tenant: form.tenant || "common" } : {}),
      };
      if (existing) {
        await updateSsoProvider({
          id: existing.id,
          ...payload,
          ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
        });
        onSaved();
        onClose();
      } else {
        const created = await createSsoProvider({
          ...payload,
          preset,
          clientSecret: form.clientSecret,
          isEnabled: true,
        });
        onSaved();
        setCreatedCallback(created.callbackUrl);
      }
    } catch (err) {
      notifications.show({ message: t(errorText(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const callbackHint = createdCallback ?? existing?.callbackUrl;

  return (
    <Modal
      opened={!!provider}
      onClose={onClose}
      title={existing ? t("Edit sign-in provider") : t("Add sign-in provider")}
      centered
      size="lg"
    >
      {createdCallback ? (
        <Stack gap="md">
          <Alert variant="light" color="green" icon={<IconCheck size={18} />}>
            {t("The provider has been added.")}
          </Alert>
          <CallbackUrl url={createdCallback} preset={preset} />
          <Button onClick={onClose}>{t("Done")}</Button>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Select
            label={t("Provider")}
            data={(["discord", "google", "microsoft", "oidc"] as SsoPreset[]).map((p) => ({
              value: p,
              label: p === "oidc" ? t("Other (OpenID Connect, e.g. Authentik, Keycloak)") : PRESET_LABEL[p],
            }))}
            value={preset}
            onChange={(v) => v && changePreset(v as SsoPreset)}
            allowDeselect={false}
            disabled={!!existing}
          />
          <TextInput
            label={t("Button name")}
            description={t('Shown as "Continue with …" on the login page.')}
            value={form.name}
            onChange={(e) => set("name")(e.currentTarget.value)}
          />
          {preset === "oidc" && (
            <TextInput
              label={t("Issuer URL")}
              placeholder="https://auth.example.org/application/o/docmost"
              value={form.issuer}
              onChange={(e) => set("issuer")(e.currentTarget.value)}
            />
          )}
          {preset === "microsoft" && (
            <TextInput
              label={t("Tenant ID")}
              description={t('Directory ID of your school or organisation. "common" allows every Microsoft account.')}
              placeholder="common"
              value={form.tenant}
              onChange={(e) => set("tenant")(e.currentTarget.value)}
            />
          )}
          <TextInput
            label={t("Client ID")}
            value={form.clientId}
            onChange={(e) => set("clientId")(e.currentTarget.value)}
          />
          <PasswordInput
            label={t("Client secret")}
            placeholder={existing?.hasClientSecret ? t("Unchanged") : ""}
            value={form.clientSecret}
            onChange={(e) => set("clientSecret")(e.currentTarget.value)}
          />
          <Switch
            mt="xs"
            label={t("Allow sign-up")}
            description={t(
              "Anyone who can sign in with this provider gets an account. Without it, only existing members and people with a join link can use it.",
            )}
            checked={form.allowSignup}
            onChange={(e) => set("allowSignup")(e.currentTarget.checked)}
          />
          {callbackHint && <CallbackUrl url={callbackHint} preset={preset} />}
          {!existing && (
            <Text size="xs" c="dimmed">
              {t("You will get the redirect URL to enter at the provider after saving.")}
            </Text>
          )}
          <Button
            mt="xs"
            onClick={save}
            loading={busy}
            disabled={
              !form.name.trim() ||
              !form.clientId.trim() ||
              (!existing && !form.clientSecret) ||
              (preset === "oidc" && !form.issuer.trim())
            }
          >
            {t("Save")}
          </Button>
        </Stack>
      )}
    </Modal>
  );
}

function CallbackUrl({ url, preset }: { url: string; preset: SsoPreset }) {
  const { t } = useTranslation();
  return (
    <Alert variant="light" icon={<IconInfoCircle size={18} />}>
      <Text size="sm" mb={6}>
        {preset === "discord"
          ? t("Enter this redirect URL in the Discord Developer Portal under OAuth2 → Redirects:")
          : t("Enter this redirect URL at the provider:")}
      </Text>
      <Group gap={6} wrap="nowrap">
        <Code style={{ wordBreak: "break-all", flex: 1 }}>{url}</Code>
        <CopyButton value={url}>
          {({ copied, copy }) => (
            <ActionIcon variant="subtle" onClick={copy} aria-label={t("Copy")}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          )}
        </CopyButton>
      </Group>
    </Alert>
  );
}
