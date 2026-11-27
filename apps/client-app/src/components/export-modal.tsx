// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Divider, Group, Modal, Radio, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconExternalLink, IconFileImport } from "@tabler/icons-react";
import { useStore } from "../lib/store";
import { exportToFile, pickAndReadLt4Docs, type ExportFormat } from "../lib/exporter";
import { errorText, openServerWindow } from "../lib/native";

export function ExportModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const store = useStore();
  const [format, setFormat] = useState<ExportFormat>("lt4docs");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const server = store.state.servers.find((s) => s.isDefault);

  useEffect(() => {
    if (opened) {
      setSelected(store.state.spaces.map((s) => s.id));
      setDone(null);
    }
  }, [opened]);

  const run = async () => {
    setBusy(true);
    try {
      const path = await exportToFile(store.state, format, selected);
      if (path) {
        setDone(path);
        store.setSettings({ lastExportAt: new Date().toISOString() });
      }
    } catch (e) {
      notifications.show({ color: "red", title: "Export fehlgeschlagen", message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const readFile = async () => {
    try {
      const plan = await pickAndReadLt4Docs();
      if (!plan) return;
      await store.importBundle(plan);
      notifications.show({
        color: "green",
        message: `${plan.pages.length} Seiten in ${plan.spaces.length} Bereich(e) eingelesen.`,
      });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", title: "Einlesen fehlgeschlagen", message: errorText(e) });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Exportieren und Einlesen" size="lg">
      <Stack>
        <Text fw={600}>Bereiche</Text>
        <Stack gap={4}>
          {store.state.spaces.map((s) => (
            <Checkbox
              key={s.id}
              label={`${s.name} (${store.state.pages.filter((p) => p.spaceId === s.id).length} Seiten)`}
              checked={selected.includes(s.id)}
              onChange={(e) =>
                setSelected((prev) =>
                  e.currentTarget.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                )
              }
            />
          ))}
        </Stack>
        <Radio.Group label="Format" value={format} onChange={(v) => setFormat(v as ExportFormat)}>
          <Stack gap="xs" mt={6}>
            <Radio
              value="lt4docs"
              label="LT4-Docs (.lt4docs) – verlustfrei, zum Import auf dem Server"
              description="Behält alle Formatierungen: Farben, Infoboxen, Tabellen, Aufgaben, Bilder."
            />
            <Radio
              value="markdown"
              label="Markdown (.zip) – für andere Programme"
              description="Farben und LT4-Blöcke gehen dabei verloren."
            />
          </Stack>
        </Radio.Group>
        <Group justify="flex-end">
          <Button leftSection={<IconDownload size={16} />} loading={busy} disabled={!selected.length} onClick={run}>
            Exportieren
          </Button>
        </Group>

        {done && (
          <Alert color="green" title="Gespeichert">
            <Text size="sm">{done}</Text>
            {format === "lt4docs" && (
              <Text size="sm" mt="xs">
                Auf dem Server: Bereich öffnen › Seiten importieren › „LT4-Docs“ und diese Datei wählen.
                Dafür musst du dort angemeldet sein.
              </Text>
            )}
            {format === "lt4docs" && server && (
              <Button
                mt="sm"
                size="xs"
                variant="light"
                leftSection={<IconExternalLink size={14} />}
                onClick={() =>
                  openServerWindow(server.url, server.name).catch((e) =>
                    notifications.show({ color: "red", message: errorText(e) }),
                  )
                }
              >
                {server.name} öffnen
              </Button>
            )}
          </Alert>
        )}

        <Divider />
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Eine .lt4docs-Datei als neue Bereiche in dieses Notizbuch übernehmen.
          </Text>
          <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={readFile}>
            Datei einlesen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
