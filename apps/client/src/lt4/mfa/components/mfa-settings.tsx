// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import { Badge, Button, Group, Modal, Text, Tooltip } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  disableMfa,
  enableMfa,
  getMfaStatus,
  regenerateBackupCodes,
  setupMfa,
} from "../mfa-service";
import { MfaSetupFlow } from "./mfa-setup-flow";
import { MfaCodeForm } from "./mfa-code-form";
import { BackupCodesView } from "./backup-codes-view";

type Dialog = "setup" | "disable" | "backup" | null;

export function MfaSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["lt4-mfa-status"],
    queryFn: getMfaStatus,
  });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["lt4-mfa-status"] });
    queryClient.invalidateQueries({ queryKey: ["lt4-mfa-members"] });
  };
  const close = () => {
    setDialog(null);
    setNewCodes(null);
    refresh();
  };

  if (!status) return null;

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div style={{ minWidth: 0, flex: 1 }}>
        <Group gap="xs">
          <Text size="md">{t("2-step verification")}</Text>
          {status.isEnabled && (
            <Badge color="green" variant="light" leftSection={<IconShieldCheck size={12} />}>
              {t("Enabled")}
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          {status.isEnabled
            ? t("Two-factor authentication is active on your account.") +
              " " +
              t("{{count}} backup codes left.", { count: status.backupCodesRemaining })
            : t("Protect your account with an additional verification layer when signing in.")}
        </Text>
      </div>

      {status.isEnabled ? (
        <Group gap="xs" wrap="nowrap">
          <Button variant="default" onClick={() => setDialog("backup")}>
            {t("Backup codes")}
          </Button>
          <Tooltip
            label={t("Two-factor authentication is required in this workspace")}
            disabled={!status.isEnforced}
          >
            <Button
              variant="default"
              color="red"
              c={status.isEnforced ? undefined : "red"}
              disabled={status.isEnforced}
              onClick={() => setDialog("disable")}
            >
              {t("Disable")}
            </Button>
          </Tooltip>
        </Group>
      ) : (
        <Button variant="default" onClick={() => setDialog("setup")} style={{ whiteSpace: "nowrap" }}>
          {t("Add 2FA method")}
        </Button>
      )}

      <Modal opened={dialog === "setup"} onClose={close} title={t("Set up two-factor authentication")} centered>
        {dialog === "setup" && (
          <MfaSetupFlow
            loadSetup={setupMfa}
            submit={enableMfa}
            onDone={() => {
              notifications.show({ message: t("Two-factor authentication has been enabled") });
              close();
            }}
          />
        )}
      </Modal>

      <Modal opened={dialog === "disable"} onClose={close} title={t("Disable two-factor authentication")} centered>
        <MfaCodeForm
          description={t(
            "Enter a code from your authenticator app or a backup code to confirm.",
          )}
          submitLabel={t("Disable")}
          color="red"
          onSubmit={async (code) => {
            await disableMfa(code);
            notifications.show({ message: t("Two-factor authentication has been disabled") });
            close();
          }}
        />
      </Modal>

      <Modal opened={dialog === "backup"} onClose={close} title={t("Generate new backup codes")} centered>
        {newCodes ? (
          <BackupCodesView codes={newCodes} onDone={close} />
        ) : (
          <MfaCodeForm
            description={t(
              "You can regenerate new backup codes at any time. This will invalidate all existing codes.",
            )}
            submitLabel={t("Generate new backup codes")}
            onSubmit={async (code) => {
              const result = await regenerateBackupCodes(code);
              setNewCodes(result.backupCodes);
            }}
          />
        )}
      </Modal>
    </Group>
  );
}
