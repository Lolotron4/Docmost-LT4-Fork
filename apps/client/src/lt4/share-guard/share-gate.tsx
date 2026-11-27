// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Anzeige für Gäste, wenn ein Link ein Passwort braucht oder abgelaufen ist.
import { useState } from "react";
import { Button, Center, Paper, PasswordInput, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconClockOff, IconLock } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { errorMessage, ShareBlock, unlockShare } from "./share-guard-service";

/** Lädt nach dem Entsperren alle Daten der öffentlichen Seite neu. */
function refetchShareQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({
    predicate: (q) => {
      // shares, shared-page-tree, share-by-id, share-search …
      return String(q.queryKey?.[0] ?? "").startsWith("share");
    },
  });
}

export function ShareGate({ block }: { block: ShareBlock }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!block.shareId || !password) return;
    setBusy(true);
    setError(null);
    try {
      await unlockShare(block.shareId, password);
      await refetchShareQueries(queryClient);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) setError(t("Too many attempts. Please wait a minute."));
      else if (status === 410) await refetchShareQueries(queryClient);
      else setError(t(errorMessage(err) ?? "Wrong password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center mih="60vh" p="md">
      <DocumentTitle title={block.kind === "expired" ? t("Link expired") : t("Protected page")} withAppName={false}>
        <meta name="robots" content="noindex" />
      </DocumentTitle>
      <Paper withBorder radius="md" p="xl" maw={380} w="100%">
        {block.kind === "expired" ? (
          <Stack align="center" gap="sm">
            <ThemeIcon size={48} radius="xl" variant="light" color="gray">
              <IconClockOff size={26} stroke={1.5} />
            </ThemeIcon>
            <Title order={3} ta="center">
              {t("This link has expired")}
            </Title>
            <Text size="sm" c="dimmed" ta="center">
              {t("Ask the person who shared it with you for a new link.")}
            </Text>
          </Stack>
        ) : (
          <form onSubmit={submit}>
            <Stack gap="sm">
              <Stack align="center" gap="sm">
                <ThemeIcon size={48} radius="xl" variant="light">
                  <IconLock size={26} stroke={1.5} />
                </ThemeIcon>
                <Title order={3} ta="center">
                  {t("This page is password protected")}
                </Title>
                <Text size="sm" c="dimmed" ta="center">
                  {t("Enter the password you received with the link.")}
                </Text>
              </Stack>
              <PasswordInput
                label={t("Password")}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                error={error}
                autoFocus
                data-autofocus
                autoComplete="current-password"
              />
              <Button type="submit" loading={busy} disabled={!password || !block.shareId} fullWidth>
                {t("Open page")}
              </Button>
            </Stack>
          </form>
        )}
      </Paper>
    </Center>
  );
}
