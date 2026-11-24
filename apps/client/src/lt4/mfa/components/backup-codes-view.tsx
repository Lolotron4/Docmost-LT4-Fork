// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Alert, Button, CopyButton, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconCheck, IconCopy, IconDownload, IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface Props {
  codes: string[];
  onDone: () => void;
}

export function BackupCodesView({ codes, onDone }: Props) {
  const { t } = useTranslation();
  const text = codes.join("\n");

  const download = () => {
    const blob = new Blob(
      [`${t("Backup codes")} (${window.location.host})\n\n${text}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "docmost-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="md">
      <Alert variant="light" color="yellow" icon={<IconInfoCircle size={18} />}>
        {t(
          "These codes can be used to access your account if you lose access to your authenticator app. Each code can only be used once.",
        )}
      </Alert>
      <SimpleGrid cols={2} spacing="xs" verticalSpacing={4}>
        {codes.map((code) => (
          <Text key={code} ff="monospace" size="md" ta="center">
            {code}
          </Text>
        ))}
      </SimpleGrid>
      <Group grow>
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Button
              variant="default"
              onClick={copy}
              leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            >
              {copied ? t("Copied") : t("Copy")}
            </Button>
          )}
        </CopyButton>
        <Button variant="default" onClick={download} leftSection={<IconDownload size={16} />}>
          {t("Download")}
        </Button>
      </Group>
      <Button onClick={onDone}>{t("I've saved my backup codes")}</Button>
    </Stack>
  );
}
