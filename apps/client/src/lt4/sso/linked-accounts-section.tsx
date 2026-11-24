// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect } from "react";
import { Button, Divider, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { listLinkedAccounts, ssoLoginUrl, unlinkAccount } from "./sso-service";
import { ProviderIcon } from "./provider-icon";

/** Profil: eigene Anmeldung mit Discord/Google/… verbinden oder trennen. */
export function LinkedAccountsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { data: workspace } = useWorkspacePublicDataQuery();
  const { data: linked } = useQuery({ queryKey: ["lt4-sso-linked"], queryFn: listLinkedAccounts });
  const providers = (workspace?.authProviders ?? []).filter((p) => p.type === "oidc");

  useEffect(() => {
    const error = params.get("ssoError");
    if (params.get("ssoLinked")) {
      notifications.show({ message: t("Account connected") });
    } else if (error) {
      notifications.show({ message: t(error), color: "red" });
    }
    if (error || params.get("ssoLinked")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!providers.length) return null;
  const linkedIds = new Set(linked?.items.map((i) => i.providerId));

  const unlink = async (id: string) => {
    try {
      await unlinkAccount(id);
      queryClient.invalidateQueries({ queryKey: ["lt4-sso-linked"] });
    } catch (err: any) {
      notifications.show({ message: t(err?.response?.data?.message ?? "Error"), color: "red" });
    }
  };

  return (
    <div>
      <Divider my="lg" />
      <Text size="md">{t("Connected accounts")}</Text>
      <Text size="sm" c="dimmed" mb="sm">
        {t("Sign in with one of these instead of your password.")}
      </Text>
      <Stack gap="xs">
        {providers.map((provider) => (
          <Group key={provider.id} justify="space-between" wrap="nowrap">
            <Group gap="sm">
              <ProviderIcon name={provider.name} />
              <Text size="sm">{provider.name}</Text>
            </Group>
            {linkedIds.has(provider.id) ? (
              <Button variant="default" size="xs" onClick={() => unlink(provider.id)}>
                {t("Disconnect")}
              </Button>
            ) : (
              <Button
                variant="default"
                size="xs"
                component="a"
                href={ssoLoginUrl(provider.id, { mode: "link" })}
              >
                {t("Connect")}
              </Button>
            )}
          </Group>
        ))}
      </Stack>
    </div>
  );
}
