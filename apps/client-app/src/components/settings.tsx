// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Radio,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconExternalLink, IconPencil, IconTrash } from "@tabler/icons-react";
import { useStore, newId } from "../lib/store";
import { errorText, openServerWindow, vault } from "../lib/native";
import type { LockKind, ServerEntry, VaultStatus } from "../lib/types";
import { LOCK_LABELS, LockSetup } from "./lock";
import { APP_VERSION } from "../version";

/** Normalisiert eine eingegebene Server-Adresse (https:// ergänzen, Pfad entfernen). */
export function normalizeServerUrl(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function ServerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ServerEntry;
  onSave: (s: Omit<ServerEntry, "id" | "isDefault">) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const norm = normalizeServerUrl(url);
    if (!norm) return setError("Bitte eine gültige Adresse eingeben, z. B. docs.example.de");
    onSave({ name: name.trim() || new URL(norm).hostname, url: norm });
    if (!initial) {
      setName("");
      setUrl("");
    }
    setError(null);
  };
  return (
    <Stack gap="xs">
      <Group grow align="flex-start">
        <TextInput label="Name" placeholder="z. B. Schule" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <TextInput
          label="Adresse"
          placeholder="https://newdocmost.lolotron4.de"
          value={url}
          error={error}
          onChange={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </Group>
      <Group justify="flex-end">
        {onCancel && (
          <Button variant="default" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
        <Button onClick={submit}>{initial ? "Speichern" : "Server hinzufügen"}</Button>
      </Group>
    </Stack>
  );
}

export function ServerSettings() {
  const store = useStore();
  const servers = store.state.servers;
  const [editing, setEditing] = useState<string | null>(null);

  const save = (list: ServerEntry[]) => {
    // Genau ein Standard-Server, sobald es Server gibt.
    if (list.length && !list.some((s) => s.isDefault)) list = list.map((s, i) => ({ ...s, isDefault: i === 0 }));
    store.saveServers(list);
  };

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Server brauchst du nur zum Online-Arbeiten und zum Hochladen. Der Standard-Server ist beim
        Exportieren für den Server vorausgewählt. Das lokale Notizbuch ist von Änderungen hier nie betroffen.
      </Text>
      {servers.length > 0 && (
        <Radio.Group
          value={servers.find((s) => s.isDefault)?.id ?? ""}
          onChange={(id) => save(servers.map((s) => ({ ...s, isDefault: s.id === id })))}
        >
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={70}>Standard</Table.Th>
                <Table.Th>Server</Table.Th>
                <Table.Th w={110} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {servers.map((s) =>
                editing === s.id ? (
                  <Table.Tr key={s.id}>
                    <Table.Td colSpan={3}>
                      <ServerForm
                        initial={s}
                        onCancel={() => setEditing(null)}
                        onSave={(v) => {
                          save(servers.map((x) => (x.id === s.id ? { ...x, ...v } : x)));
                          setEditing(null);
                        }}
                      />
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <Radio value={s.id} aria-label={`${s.name} als Standard`} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {s.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {s.url}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          aria-label="Öffnen"
                          onClick={() =>
                            openServerWindow(s.url, s.name).catch((e) =>
                              notifications.show({ color: "red", message: errorText(e) }),
                            )
                          }
                        >
                          <IconExternalLink size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="gray" aria-label="Bearbeiten" onClick={() => setEditing(s.id)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label="Entfernen"
                          onClick={() => save(servers.filter((x) => x.id !== s.id))}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ),
              )}
            </Table.Tbody>
          </Table>
        </Radio.Group>
      )}
      <ServerForm onSave={(v) => save([...servers, { id: newId(), isDefault: servers.length === 0, ...v }])} />
    </Stack>
  );
}

function LockSettings({ status, onStatus }: { status: VaultStatus; onStatus: (s: VaultStatus) => void }) {
  const store = useStore();
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Stack>
      <Group>
        <Text size="sm">Aktuelle Sperre:</Text>
        <Badge variant="light">{LOCK_LABELS[status.kind]}</Badge>
      </Group>
      {status.unprotected && (
        <Alert color="yellow">
          Ohne Sperre und ohne Schlüsselbund des Systems liegt der Schlüssel ungeschützt auf diesem
          Gerät. Richte am besten eine Sperre ein.
        </Alert>
      )}
      <Select
        label="Automatisch sperren nach"
        value={String(store.state.settings.autoLockMinutes)}
        onChange={(v) => store.setSettings({ autoLockMinutes: Number(v ?? 5) })}
        disabled={status.kind === "none"}
        data={[
          { value: "1", label: "1 Minute" },
          { value: "5", label: "5 Minuten" },
          { value: "15", label: "15 Minuten" },
          { value: "60", label: "1 Stunde" },
          { value: "0", label: "Nie (nur beim Start und per Knopf)" },
        ]}
      />
      {!changing ? (
        <Button variant="default" onClick={() => setChanging(true)}>
          Sperre ändern
        </Button>
      ) : (
        <LockSetup
          initialKind={status.kind === "none" ? "pin" : status.kind}
          submitLabel="Sperre speichern"
          busy={busy}
          onDone={async (kind: LockKind, secret?: string) => {
            setBusy(true);
            try {
              onStatus(await vault.changeLock(kind, secret));
              notifications.show({ color: "green", message: `Sperre geändert: ${LOCK_LABELS[kind]}` });
              setChanging(false);
            } catch (e) {
              notifications.show({ color: "red", title: "Sperre nicht geändert", message: errorText(e) });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      <Text size="xs" c="dimmed">
        Fingerabdruck (Android, Touch ID, Windows Hello) kommt mit der Android-Version in Phase 4.
      </Text>
    </Stack>
  );
}

function DataSettings({ onWiped }: { onWiped: () => void }) {
  const [word, setWord] = useState("");
  return (
    <Stack>
      <Text size="sm">
        Alle Seiten, Bilder und Einstellungen liegen verschlüsselt nur auf diesem Gerät. Hier kannst
        du alles löschen, z. B. bevor du ein Gerät weitergibst.
      </Text>
      <TextInput label='Zum Bestätigen "LÖSCHEN" eingeben' value={word} onChange={(e) => setWord(e.currentTarget.value)} />
      <Button
        color="red"
        disabled={word.trim().toUpperCase() !== "LÖSCHEN"}
        onClick={async () => {
          await vault.reset();
          onWiped();
        }}
      >
        Alle lokalen Daten löschen
      </Button>
      <Text size="xs" c="dimmed">
        LT4-Docs Client {APP_VERSION} · Based on Docmost · AGPL-3.0
      </Text>
    </Stack>
  );
}

export function SettingsModal({
  opened,
  onClose,
  status,
  onStatus,
  onWiped,
  initialTab = "lock",
}: {
  opened: boolean;
  onClose: () => void;
  status: VaultStatus;
  onStatus: (s: VaultStatus) => void;
  onWiped: () => void;
  initialTab?: string;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Einstellungen" size="lg">
      <Tabs defaultValue={initialTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="lock">App-Sperre</Tabs.Tab>
          <Tabs.Tab value="servers">Server</Tabs.Tab>
          <Tabs.Tab value="data">Daten</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="lock">
          <LockSettings status={status} onStatus={onStatus} />
        </Tabs.Panel>
        <Tabs.Panel value="servers">
          <ServerSettings />
        </Tabs.Panel>
        <Tabs.Panel value="data">
          <DataSettings onWiped={onWiped} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
