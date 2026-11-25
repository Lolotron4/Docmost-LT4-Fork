// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Anchor, Code, List, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import i18n from "i18next";
import { LT4_REPO_URL } from "@/lt4/version";

export const LT4_INTEGRATIONS_GUIDE_URL = `${LT4_REPO_URL}/blob/main/docs/lt4/integrationen.md`;

function callbackUrl(type: string) {
  return `${window.location.origin}/api/integrations/oauth/${type}/callback`;
}

function OAuthHint({
  type,
  envKeys,
  intro,
}: {
  type: string;
  envKeys: string[];
  intro: string;
}) {
  const t = i18n.t.bind(i18n);
  return (
    <Stack gap={6}>
      <Text size="sm">{intro}</Text>
      <List size="sm" spacing={2}>
        {envKeys.map((key) => (
          <List.Item key={key}>
            <Code>{key}</Code>
          </List.Item>
        ))}
      </List>
      <Text size="sm">
        {t("Callback URL of the OAuth app:")} <Code>{callbackUrl(type)}</Code>
      </Text>
      <Anchor
        href={LT4_INTEGRATIONS_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
      >
        {t("Setup guide")}
      </Anchor>
    </Stack>
  );
}

/** Installation ohne OAuth-App: nur öffentliche Repositories bekommen Vorschauen. */
export function openPublicInstallModal(opts: {
  name: string;
  type: string;
  envKeys: string[];
  onConfirm: () => void;
}) {
  const t = i18n.t.bind(i18n);
  modals.openConfirmModal({
    title: t("Install {{name}} without OAuth app", { name: opts.name }),
    centered: true,
    size: "lg",
    children: (
      <Stack gap="sm">
        <Text size="sm">
          {t(
            "No OAuth app is configured. {{name}} will be installed with previews for public repositories only. Links to private repositories stay normal links.",
            { name: opts.name },
          )}
        </Text>
        <OAuthHint
          type={opts.type}
          envKeys={opts.envKeys}
          intro={t(
            "For private repositories, create an OAuth app at the provider and set these environment variables in the stack:",
          )}
        />
      </Stack>
    ),
    labels: { confirm: t("Install"), cancel: t("Cancel") },
    onConfirm: opts.onConfirm,
  });
}

/** Anbieter ohne öffentliche Vorschauen brauchen zwingend eine OAuth-App. */
export function openOAuthRequiredModal(opts: {
  name: string;
  type: string;
  envKeys: string[];
}) {
  const t = i18n.t.bind(i18n);
  modals.open({
    title: t("{{name}} needs an OAuth app", { name: opts.name }),
    centered: true,
    size: "lg",
    children: (
      <OAuthHint
        type={opts.type}
        envKeys={opts.envKeys}
        intro={t(
          "This integration only works with an OAuth app. Create one at the provider and set these environment variables in the stack, then restart it:",
        )}
      />
    ),
  });
}
