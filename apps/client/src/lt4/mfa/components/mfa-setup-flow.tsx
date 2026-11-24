// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import {
  Anchor,
  Button,
  Center,
  Code,
  Collapse,
  Image,
  Loader,
  PinInput,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IMfaSetup, errorMessage } from "../mfa-service";
import { BackupCodesView } from "./backup-codes-view";

interface Props {
  loadSetup: () => Promise<IMfaSetup>;
  submit: (code: string) => Promise<{ backupCodes: string[] }>;
  onDone: () => void;
}

/** QR-Code anzeigen, Code bestätigen, Backup-Codes zeigen. */
export function MfaSetupFlow({ loadSetup, submit, onDone }: Props) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<IMfaSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    loadSetup()
      .then((data) => active && setSetup(data))
      .catch(
        (err) =>
          active &&
          setLoadError(
            errorMessage(err, t("Failed to generate QR code. Please try again.")),
          ),
      );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submit(value);
      setBackupCodes(result.backupCodes);
    } catch (err) {
      setError(errorMessage(err, t("Invalid verification code")));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (backupCodes) {
    return (
      <Stack gap="sm">
        <Text fw={500}>{t("Save your backup codes")}</Text>
        <BackupCodesView codes={backupCodes} onDone={onDone} />
      </Stack>
    );
  }

  if (loadError) {
    return <Text c="red">{loadError}</Text>;
  }

  if (!setup) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" fw={500}>
        {t("1. Scan this QR code with your authenticator app")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("For example Aegis, 2FAS, Google Authenticator or Microsoft Authenticator.")}
      </Text>
      <Center>
        <Image src={setup.qrCode} alt={t("MFA QR Code")} w={200} h={200} radius="sm" />
      </Center>
      <div>
        <Anchor component="button" type="button" size="sm" onClick={() => setShowSecret((v) => !v)}>
          {t("Can't scan the code?")}
        </Anchor>
        <Collapse expanded={showSecret}>
          <Text size="xs" mt={6}>
            {t("Enter this code manually in your authenticator app:")}
          </Text>
          <Code block mt={4} style={{ wordBreak: "break-all" }}>
            {setup.secret}
          </Code>
        </Collapse>
      </div>

      <Text size="sm" fw={500}>
        {t("2. Enter the 6-digit code from your authenticator")}
      </Text>
      <Center>
        <PinInput
          length={6}
          type="number"
          oneTimeCode
          autoFocus
          value={code}
          onChange={setCode}
          onComplete={(v) => handleSubmit(v)}
          error={!!error}
          aria-label={t("Verification code")}
        />
      </Center>
      {error && (
        <Text c="red" size="sm" ta="center" role="alert">
          {t(error)}
        </Text>
      )}
      <Button onClick={() => handleSubmit()} loading={busy} disabled={code.length !== 6}>
        {t("Verify and enable")}
      </Button>
    </Stack>
  );
}
