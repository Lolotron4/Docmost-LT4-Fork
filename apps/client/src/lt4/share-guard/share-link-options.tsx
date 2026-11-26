// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Teilen-Dialog: Ablaufdatum und Passwort für den öffentlichen Link.
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, PasswordInput, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  errorMessage,
  getShareGuardSettings,
  getShareLinkPolicy,
  MIN_SHARE_PASSWORD_LENGTH,
  ShareLinkPolicyForUser,
  updateShareGuard,
} from "./share-guard-service";

const DAY = 86400_000;
const PRESETS = [1, 7, 30, 90];

export function useShareLinkPolicy() {
  return useQuery({
    queryKey: ["lt4-share-policy"],
    queryFn: getShareLinkPolicy,
    staleTime: 60_000,
  });
}

/** Gilt für diese Person eine Pflicht (Ablauf oder Passwort)? */
export function policyApplies(policy?: ShareLinkPolicyForUser | null) {
  if (!policy || policy.canBypass) return false;
  return policy.requireExpiry || !!policy.maxDays || policy.requirePassword;
}

function effective(policy?: ShareLinkPolicyForUser | null) {
  const applies = !!policy && !policy.canBypass;
  return {
    expiryRequired: applies && (policy!.requireExpiry || !!policy!.maxDays),
    maxDays: applies ? policy!.maxDays ?? null : null,
    passwordRequired: applies && policy!.requirePassword,
  };
}

/** Wert für <input type="datetime-local"> in lokaler Zeit. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string, lang: string) {
  return new Date(iso).toLocaleString(lang, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type ExpiryChoice = "never" | "custom" | `${number}`;

/**
 * Auswahl für das Ablaufdatum. Liefert ein ISO-Datum oder null (nie).
 */
function ExpiryPicker({
  value,
  onChange,
  disabled,
  maxDays,
  required,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  maxDays: number | null;
  required: boolean;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<ExpiryChoice>(value ? "custom" : "never");
  const [custom, setCustom] = useState<string>(value ? toLocalInput(new Date(value)) : "");

  useEffect(() => {
    setChoice(value ? "custom" : "never");
    setCustom(value ? toLocalInput(new Date(value)) : "");
  }, [value]);

  const presets = PRESETS.filter((d) => !maxDays || d <= maxDays);
  if (maxDays && !presets.includes(maxDays)) presets.push(maxDays);

  const data = [
    ...(required ? [] : [{ value: "never", label: t("Never") }]),
    ...presets.map((d) => ({
      value: String(d),
      label: d === 1 ? t("In 1 day") : t("In {{count}} days", { count: d }),
    })),
    { value: "custom", label: t("Pick date and time") },
  ];

  const max = maxDays ? toLocalInput(new Date(Date.now() + maxDays * DAY)) : undefined;

  return (
    <Stack gap={6}>
      <Select
        size="xs"
        label={t("Link expires")}
        data={data}
        value={choice === "never" && required ? null : choice}
        placeholder={t("Choose")}
        allowDeselect={false}
        disabled={disabled}
        comboboxProps={{ withinPortal: false }}
        onChange={(v) => {
          if (!v) return;
          setChoice(v as ExpiryChoice);
          if (v === "never") onChange(null);
          else if (v !== "custom") onChange(new Date(Date.now() + Number(v) * DAY).toISOString());
        }}
      />
      {choice === "custom" && (
        <TextInput
          size="xs"
          type="datetime-local"
          value={custom}
          min={toLocalInput(new Date(Date.now() + 5 * 60_000))}
          max={max}
          disabled={disabled}
          onChange={(e) => setCustom(e.currentTarget.value)}
          onBlur={() => {
            if (!custom) return;
            const d = new Date(custom);
            if (!Number.isNaN(d.getTime()) && d.toISOString() !== value) onChange(d.toISOString());
          }}
          aria-label={t("Expiry date")}
        />
      )}
    </Stack>
  );
}

/**
 * Vor dem Erstellen, wenn die Workspace-Regeln Ablauf und/oder Passwort verlangen.
 */
export function ShareCreateForm({
  policy,
  onCreate,
  onCancel,
  busy,
}: {
  policy: ShareLinkPolicyForUser;
  onCreate: (data: { expiresAt: string | null; password: string | null }) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const rules = effective(policy);
  const defaultDays = rules.maxDays ? Math.min(7, rules.maxDays) : 7;
  const [expiresAt, setExpiresAt] = useState<string | null>(
    rules.expiryRequired ? new Date(Date.now() + defaultDays * DAY).toISOString() : null,
  );
  const [password, setPassword] = useState("");

  const valid =
    (!rules.expiryRequired || !!expiresAt) &&
    (!rules.passwordRequired || password.length >= MIN_SHARE_PASSWORD_LENGTH) &&
    (!password || password.length >= MIN_SHARE_PASSWORD_LENGTH);

  return (
    <Stack gap="xs" mt="sm">
      <Text size="xs" c="dimmed">
        {rules.passwordRequired && rules.expiryRequired
          ? t("In this workspace, public links need an expiry date and a password.")
          : rules.passwordRequired
            ? t("In this workspace, public links need a password.")
            : t("In this workspace, public links need an expiry date.")}
      </Text>
      <ExpiryPicker
        value={expiresAt}
        onChange={setExpiresAt}
        maxDays={rules.maxDays}
        required={rules.expiryRequired}
      />
      <PasswordInput
        size="xs"
        label={rules.passwordRequired ? t("Password") : t("Password (optional)")}
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        autoComplete="new-password"
        error={
          password && password.length < MIN_SHARE_PASSWORD_LENGTH
            ? t("At least {{count}} characters", { count: MIN_SHARE_PASSWORD_LENGTH })
            : undefined
        }
      />
      <Group justify="flex-end" gap="xs">
        <Button size="compact-sm" variant="default" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button
          size="compact-sm"
          disabled={!valid}
          loading={busy}
          onClick={() => onCreate({ expiresAt, password: password || null })}
        >
          {t("Create link")}
        </Button>
      </Group>
    </Stack>
  );
}

/** Einstellungen eines bestehenden Links im Teilen-Dialog. */
export function ShareLinkOptions({ shareId, readOnly }: { shareId: string; readOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: policy } = useShareLinkPolicy();
  const rules = effective(policy);
  const queryKey = useMemo(() => ["lt4-share-guard", shareId], [shareId]);
  const { data } = useQuery({
    queryKey,
    queryFn: () => getShareGuardSettings(shareId),
    enabled: !!shareId,
  });
  const [busy, setBusy] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState("");

  if (!data) return null;

  const save = async (changes: { expiresAt?: string | null; password?: string | null }, message: string) => {
    setBusy(true);
    try {
      const res = await updateShareGuard({ shareId, ...changes });
      queryClient.setQueryData(queryKey, res);
      notifications.show({ message });
      return true;
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
      queryClient.invalidateQueries({ queryKey });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const passwordTooShort = password.length > 0 && password.length < MIN_SHARE_PASSWORD_LENGTH;

  return (
    <Stack gap="xs" mt="sm">
      <div>
        <ExpiryPicker
          value={data.expiresAt}
          disabled={readOnly || busy}
          maxDays={rules.maxDays}
          required={rules.expiryRequired}
          onChange={(iso) =>
            save({ expiresAt: iso }, iso ? t("Expiry date saved") : t("The link no longer expires"))
          }
        />
        {data.expiresAt && (
          <Group gap={6} mt={4}>
            {data.expired ? (
              <Badge size="xs" color="red" variant="light">
                {t("Expired")}
              </Badge>
            ) : null}
            <Text size="xs" c="dimmed">
              {data.expired
                ? t("Expired on {{date}}", { date: formatDate(data.expiresAt, i18n.language) })
                : t("Valid until {{date}}", { date: formatDate(data.expiresAt, i18n.language) })}
            </Text>
          </Group>
        )}
      </div>

      <div>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <div>
            <Text size="sm">{t("Password")}</Text>
            <Text size="xs" c="dimmed">
              {data.hasPassword
                ? t("Guests must enter a password")
                : t("Anyone with the link can open it")}
            </Text>
          </div>
          {!readOnly && !editingPassword && (
            <Group gap={4} wrap="nowrap">
              <Button size="compact-xs" variant="default" onClick={() => setEditingPassword(true)}>
                {data.hasPassword ? t("Change") : t("Set password")}
              </Button>
              {data.hasPassword && !rules.passwordRequired && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  loading={busy}
                  onClick={() => save({ password: null }, t("Password removed"))}
                >
                  {t("Remove")}
                </Button>
              )}
            </Group>
          )}
        </Group>
        {editingPassword && (
          <Group gap={4} mt={6} wrap="nowrap" align="flex-start">
            <PasswordInput
              size="xs"
              style={{ flex: 1 }}
              placeholder={t("New password")}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="new-password"
              autoFocus
              error={passwordTooShort ? t("At least {{count}} characters", { count: MIN_SHARE_PASSWORD_LENGTH }) : undefined}
            />
            <Button
              size="xs"
              loading={busy}
              disabled={!password || passwordTooShort}
              onClick={async () => {
                if (await save({ password }, t("Password saved"))) {
                  setPassword("");
                  setEditingPassword(false);
                }
              }}
            >
              {t("Save")}
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                setPassword("");
                setEditingPassword(false);
              }}
            >
              {t("Cancel")}
            </Button>
          </Group>
        )}
      </div>
    </Stack>
  );
}
