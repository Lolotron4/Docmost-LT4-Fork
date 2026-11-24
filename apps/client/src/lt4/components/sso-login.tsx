// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect } from "react";
import { Alert, Button, Divider, Stack } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { ssoLoginUrl } from "@/lt4/sso/sso-service";
import { ProviderIcon } from "@/lt4/sso/provider-icon";

interface Props {
  mode?: "login" | "join";
  joinCode?: string;
}

/** Buttons "Mit … anmelden" für alle aktiven SSO-Anbieter des Workspaces. */
export default function SsoLogin({ mode = "login", joinCode }: Props) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { data } = useWorkspacePublicDataQuery();
  const providers = (data?.authProviders ?? []).filter((p) => p.type === "oidc");
  const ssoError = params.get("ssoError");

  useEffect(() => {
    // Fehler nur einmal zeigen, auch nach einem Neuladen nicht erneut.
    if (!ssoError) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ssoError");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [ssoError]);

  if (!providers.length && !ssoError) return null;

  return (
    <Stack gap="sm" mb="md">
      {ssoError && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
          {t(ssoError)}
        </Alert>
      )}
      {providers.map((provider) => (
        <Button
          key={provider.id}
          component="a"
          href={ssoLoginUrl(provider.id, {
            mode,
            code: joinCode,
            redirect: params.get("redirect") ?? undefined,
          })}
          variant="default"
          fullWidth
          leftSection={<ProviderIcon name={provider.name} />}
        >
          {t("Continue with {{name}}", { name: provider.name })}
        </Button>
      ))}
      {providers.length > 0 && !data?.enforceSso && (
        <Divider label={t("or")} labelPosition="center" my={4} />
      )}
    </Stack>
  );
}
