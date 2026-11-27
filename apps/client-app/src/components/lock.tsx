// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// App-Sperre einrichten und entsperren (Muster, PIN, Passwort).
import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Center,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { PatternPad } from "./pattern-pad";
import { errorText, vault } from "../lib/native";
import type { LockKind, VaultStatus } from "../lib/types";
import { Lt4Logo } from "./logo";

export const LOCK_LABELS: Record<LockKind, string> = {
  none: "Keine Sperre",
  pin: "PIN",
  password: "Passwort",
  pattern: "Muster",
};

export function validateSecret(kind: LockKind, secret: string): string | null {
  if (kind === "none") return null;
  if (kind === "pin") return /^\d{6,}$/.test(secret) ? null : "Die PIN muss mindestens 6 Ziffern haben.";
  if (kind === "password") return [...secret].length >= 8 ? null : "Das Passwort muss mindestens 8 Zeichen haben.";
  const pts = secret.split("-");
  return pts.length >= 4 && new Set(pts).size === pts.length
    ? null
    : "Das Muster muss mindestens 4 Punkte verbinden.";
}

/** Code zweimal eingeben lassen; ruft onDone(kind, secret) auf. */
export function LockSetup({
  onDone,
  submitLabel = "Weiter",
  busy,
  initialKind = "pin",
}: {
  onDone: (kind: LockKind, secret?: string) => void;
  submitLabel?: string;
  busy?: boolean;
  initialKind?: LockKind;
}) {
  const [kind, setKind] = useState<LockKind>(initialKind);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [patternFirst, setPatternFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirst("");
    setSecond("");
    setPatternFirst(null);
    setError(null);
  }, [kind]);

  const submitText = () => {
    const err = validateSecret(kind, first);
    if (err) return setError(err);
    if (first !== second) return setError("Die beiden Eingaben stimmen nicht überein.");
    onDone(kind, first);
  };

  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        value={kind}
        onChange={(v) => setKind(v as LockKind)}
        data={(["pattern", "pin", "password", "none"] as LockKind[]).map((k) => ({
          value: k,
          label: LOCK_LABELS[k],
        }))}
      />

      {kind === "none" && (
        <Alert color="yellow" title="Ohne Sperre">
          Jeder, der dieses Gerät benutzt, kann deine Notizen öffnen. Für geteilte Rechner (z. B. in
          der Schule) besser ein Muster, eine PIN oder ein Passwort wählen.
        </Alert>
      )}

      {(kind === "pin" || kind === "password") && (
        <>
          {kind === "pin" ? (
            <>
              <TextInput
                label="PIN (mindestens 6 Ziffern)"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={first}
                onChange={(e) => setFirst(e.currentTarget.value.replace(/\D/g, ""))}
                autoFocus
              />
              <TextInput
                label="PIN wiederholen"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={second}
                onChange={(e) => setSecond(e.currentTarget.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && submitText()}
              />
            </>
          ) : (
            <>
              <PasswordInput
                label="Passwort (mindestens 8 Zeichen)"
                autoComplete="new-password"
                value={first}
                onChange={(e) => setFirst(e.currentTarget.value)}
                autoFocus
              />
              <PasswordInput
                label="Passwort wiederholen"
                autoComplete="new-password"
                value={second}
                onChange={(e) => setSecond(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && submitText()}
              />
            </>
          )}
        </>
      )}

      {kind === "pattern" && (
        <Stack align="center" gap="xs">
          <Text size="sm" c="dimmed">
            {patternFirst ? "Muster zur Bestätigung noch einmal zeichnen" : "Muster zeichnen (mindestens 4 Punkte)"}
          </Text>
          <PatternPad
            error={!!error}
            onComplete={(p) => {
              if (!patternFirst) {
                const err = validateSecret("pattern", p);
                if (err) return setError(err);
                setError(null);
                setPatternFirst(p);
              } else if (p !== patternFirst) {
                setError("Die Muster stimmen nicht überein. Bitte neu beginnen.");
                setPatternFirst(null);
              } else {
                setError(null);
                onDone("pattern", p);
              }
            }}
          />
        </Stack>
      )}

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}

      {kind !== "pattern" && (
        <Button loading={busy} onClick={() => (kind === "none" ? onDone("none") : submitText())}>
          {submitLabel}
        </Button>
      )}

      {kind !== "none" && (
        <Text size="xs" c="dimmed">
          Aus dem Code wird der Schlüssel für deine lokalen Daten erzeugt. Wer ihn vergisst, kann
          die Daten nicht mehr öffnen. Exportiere wichtige Seiten deshalb regelmäßig.
        </Text>
      )}
    </Stack>
  );
}

export function LockScreen({
  status,
  onUnlocked,
  onReset,
}: {
  status: VaultStatus;
  onUnlocked: (s: VaultStatus) => void;
  onReset: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(status.waitSeconds);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => window.clearInterval(t);
  }, [wait > 0]);

  const tryUnlock = async (value: string) => {
    if (!value || busy || wait > 0) return;
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await vault.unlock(value));
    } catch (e) {
      setError(errorText(e));
      const s = await vault.status().catch(() => null);
      if (s) setWait(s.waitSeconds);
      setSecret("");
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || wait > 0;

  return (
    <Center h="100vh" p="md">
      <Stack w={340} maw="100%" align="stretch" gap="md">
        <Stack align="center" gap={4}>
          <Lt4Logo size={48} />
          <Title order={3}>LT4-Docs ist gesperrt</Title>
          <Text size="sm" c="dimmed">
            {status.kind === "pattern"
              ? "Muster zeichnen"
              : status.kind === "pin"
                ? "PIN eingeben"
                : "Passwort eingeben"}
          </Text>
        </Stack>

        {status.kind === "pattern" ? (
          <Center>
            <PatternPad disabled={disabled} error={!!error} onComplete={tryUnlock} />
          </Center>
        ) : (
          <>
            {status.kind === "pin" ? (
              <TextInput
                aria-label="PIN"
                type="password"
                inputMode="numeric"
                autoFocus
                disabled={disabled}
                value={secret}
                onChange={(e) => setSecret(e.currentTarget.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && tryUnlock(secret)}
                size="lg"
                styles={{ input: { textAlign: "center", letterSpacing: 8 } }}
              />
            ) : (
              <PasswordInput
                aria-label="Passwort"
                autoFocus
                disabled={disabled}
                value={secret}
                onChange={(e) => setSecret(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && tryUnlock(secret)}
                size="lg"
              />
            )}
            <Button
              leftSection={<IconLock size={16} />}
              loading={busy}
              disabled={wait > 0}
              onClick={() => tryUnlock(secret)}
            >
              Entsperren
            </Button>
          </>
        )}

        {wait > 0 && (
          <Text c="orange" size="sm" ta="center">
            Zu viele Fehlversuche. Nächster Versuch in {wait} s.
          </Text>
        )}
        {error && wait === 0 && (
          <Text c="red" size="sm" ta="center">
            {error}
          </Text>
        )}

        <Group justify="center">
          <Anchor size="sm" c="dimmed" onClick={() => setResetOpen(true)}>
            Code vergessen?
          </Anchor>
        </Group>
      </Stack>

      <Modal opened={resetOpen} onClose={() => setResetOpen(false)} title="Code vergessen" centered>
        <Stack>
          <Text size="sm">
            Ohne Code lassen sich die lokalen Daten nicht entschlüsseln. Du kannst nur alles auf
            diesem Gerät löschen und neu anfangen. Seiten, die du vorher exportiert oder auf einen
            Server hochgeladen hast, bleiben dort erhalten.
          </Text>
          <TextInput
            label='Zum Bestätigen "LÖSCHEN" eingeben'
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.currentTarget.value)}
          />
          <Button
            color="red"
            disabled={confirmWord.trim().toUpperCase() !== "LÖSCHEN"}
            onClick={async () => {
              await vault.reset();
              setResetOpen(false);
              onReset();
            }}
          >
            Alle lokalen Daten löschen
          </Button>
        </Stack>
      </Modal>
    </Center>
  );
}
