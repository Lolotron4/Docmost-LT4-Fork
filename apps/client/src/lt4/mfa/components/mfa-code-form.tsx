// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import { Button, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../mfa-service";

interface Props {
  description: string;
  submitLabel: string;
  color?: string;
  onSubmit: (code: string) => Promise<void>;
}

/** Abfrage eines Codes aus der App oder eines Backup-Codes zur Bestätigung. */
export function MfaCodeForm({ description, submitLabel, color, onSubmit }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(code.trim());
    } catch (err) {
      setError(t(errorMessage(err, "Invalid verification code")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <Text size="sm">{description}</Text>
        <TextInput
          label={t("Verification code")}
          placeholder="123456"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.currentTarget.value)}
          error={error}
          maxLength={32}
        />
        <Button type="submit" color={color} loading={busy} disabled={!code.trim()}>
          {submitLabel}
        </Button>
      </Stack>
    </form>
  );
}
