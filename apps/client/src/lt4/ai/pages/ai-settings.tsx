// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  PasswordInput,
  Radio,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { AiAccessSection } from "@/lt4/ai/pages/ai-access-section";
import {
  AI_KEY_URLS,
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  AiProvider,
  getAiSettings,
  IAiSettings,
  listAiModels,
  updateAiSettings,
} from "@/lt4/ai/services/ai-service";

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

export default function AiSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["lt4-ai-settings"],
    queryFn: getAiSettings,
    enabled: isAdmin,
  });

  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [models, setModels] = useState<Record<AiProvider, string>>({
    anthropic: "",
    openai: "",
    google: "",
  });
  const [newKeys, setNewKeys] = useState<Record<AiProvider, string>>({
    anthropic: "",
    openai: "",
    google: "",
  });
  const [modelOptions, setModelOptions] = useState<Record<AiProvider, string[]>>({
    anthropic: [],
    openai: [],
    google: [],
  });
  const [busy, setBusy] = useState(false);
  const [loadingModels, setLoadingModels] = useState<AiProvider | null>(null);

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider);
    setModels(data.models);
  }, [data]);

  if (!isAdmin) return <Navigate to="/settings/account/profile" replace />;

  const applyResult = (result: IAiSettings) => {
    queryClient.setQueryData(["lt4-ai-settings"], result);
    queryClient.invalidateQueries({ queryKey: ["lt4-ai-status"] });
    if (workspace) {
      setWorkspace({
        ...workspace,
        settings: {
          ...workspace.settings,
          ai: { ...(workspace.settings?.ai ?? {}), generative: result.enabled },
        },
      });
    }
  };

  const run = async (fn: () => Promise<IAiSettings>, message?: string) => {
    setBusy(true);
    try {
      applyResult(await fn());
      if (message) notifications.show({ message });
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = (enabled: boolean) =>
    run(() => updateAiSettings({ enabled }));

  const save = () => {
    const apiKeys: Partial<Record<AiProvider, string>> = {};
    for (const p of AI_PROVIDERS) {
      if (newKeys[p].trim()) apiKeys[p] = newKeys[p].trim();
    }
    return run(async () => {
      const result = await updateAiSettings({ provider, models, apiKeys });
      setNewKeys({ anthropic: "", openai: "", google: "" });
      return result;
    }, t("Saved"));
  };

  const removeKey = (p: AiProvider) =>
    run(() => updateAiSettings({ apiKeys: { [p]: "" } }), t("API key removed"));

  const loadModels = async (p: AiProvider) => {
    setLoadingModels(p);
    try {
      const { models: list } = await listAiModels(p);
      setModelOptions((prev) => ({ ...prev, [p]: list }));
      notifications.show({
        message: t("API key works. {{count}} models found.", { count: list.length }),
      });
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setLoadingModels(null);
    }
  };

  const activeHasKey = !!data?.keys?.[provider];

  return (
    <>
      <DocumentTitle title={t("AI assistant")} />
      <SettingsTitle title={t("AI assistant")} />

      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("Enable AI writing assistant")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              "Members can select text or type /ai in the editor to write, summarize, translate or improve text.",
            )}
          </Text>
        </div>
        <Switch
          checked={!!data?.enabled}
          disabled={busy || !data}
          onChange={(e) => toggleEnabled(e.currentTarget.checked)}
          aria-label={t("Enable AI writing assistant")}
        />
      </Group>

      <Alert variant="light" mt="lg" icon={<IconInfoCircle size={18} />}>
        {t(
          "The selected text is sent to the chosen provider and processed there. Usage is billed to the API key you enter.",
        )}
      </Alert>

      {data && (
        <>
          <Divider my="xl" />
          <AiAccessSection
            data={data}
            busy={busy}
            onUpdate={(input) => run(() => updateAiSettings(input))}
          />
        </>
      )}

      <Divider my="xl" />

      <Radio.Group
        label={t("Provider used in the editor")}
        value={provider}
        onChange={(v) => setProvider(v as AiProvider)}
      >
        <Group mt="xs">
          {AI_PROVIDERS.map((p) => (
            <Radio key={p} value={p} label={AI_PROVIDER_LABELS[p]} />
          ))}
        </Group>
      </Radio.Group>
      {data && !activeHasKey && (
        <Text size="sm" c="orange" mt="xs">
          {t("No API key is saved for this provider yet.")}
        </Text>
      )}

      <Stack mt="lg" gap="md">
        {AI_PROVIDERS.map((p) => (
          <Card key={p} withBorder radius="md" p="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <Text fw={600}>{AI_PROVIDER_LABELS[p]}</Text>
                {provider === p && (
                  <Badge size="sm" variant="light">
                    {t("Active")}
                  </Badge>
                )}
              </Group>
              {data?.keys?.[p] ? (
                <Group gap="xs">
                  <Badge color="green" variant="light">
                    {t("Key saved")} {data.keys[p]}
                  </Badge>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    disabled={busy}
                    onClick={() => removeKey(p)}
                  >
                    {t("Remove")}
                  </Button>
                </Group>
              ) : (
                <Badge color="gray" variant="light">
                  {t("No key")}
                </Badge>
              )}
            </Group>

            <PasswordInput
              label={data?.keys?.[p] ? t("Replace API key") : t("API key")}
              placeholder={t("Paste API key")}
              value={newKeys[p]}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setNewKeys((prev) => ({ ...prev, [p]: value }));
              }}
              autoComplete="off"
              description={
                <Anchor href={AI_KEY_URLS[p]} target="_blank" rel="noreferrer" size="xs">
                  {t("Create an API key")}
                </Anchor>
              }
            />

            <Group align="flex-end" mt="sm" wrap="nowrap">
              <Autocomplete
                style={{ flex: 1 }}
                label={t("Model")}
                placeholder={data?.defaultModels?.[p]}
                value={models[p] ?? ""}
                data={modelOptions[p]}
                limit={50}
                onChange={(value) => setModels((prev) => ({ ...prev, [p]: value }))}
              />
              <Button
                variant="default"
                loading={loadingModels === p}
                disabled={!data?.keys?.[p]}
                onClick={() => loadModels(p)}
              >
                {t("Test key and load models")}
              </Button>
            </Group>
          </Card>
        ))}
      </Stack>

      <Group justify="flex-end" mt="lg">
        <Button onClick={save} loading={busy} disabled={!data}>
          {t("Save")}
        </Button>
      </Group>
    </>
  );
}
