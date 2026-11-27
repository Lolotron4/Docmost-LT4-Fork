// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Divider, Group, Modal, Radio, SegmentedControl, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconExternalLink, IconFileImport, IconPrinter } from "@tabler/icons-react";
import { useStore } from "../lib/store";
import {
  NothingToExportError,
  exportToFile,
  pickAndReadLt4Docs,
  type ExportFormat,
  type ExportScope,
} from "../lib/exporter";
import { errorText, openServerWindow } from "../lib/native";

/** Formate, die auch einzelne Seiten können (.lt4docs/Markdown exportieren immer ganze Bereiche). */
const PAGE_FORMATS: ExportFormat[] = ["docx", "pdf", "xlsx"];

export function ExportModal({
  opened,
  onClose,
  currentPageId,
}: {
  opened: boolean;
  onClose: () => void;
  currentPageId?: string | null;
}) {
  const store = useStore();
  const [format, setFormat] = useState<ExportFormat>("lt4docs");
  const [scopeKind, setScopeKind] = useState<"spaces" | "page">("spaces");
  const [withChildren, setWithChildren] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const server = store.state.servers.find((s) => s.isDefault);

  useEffect(() => {
    if (opened) {
      setSelected(store.state.spaces.map((s) => s.id));
      setDone(null);
      setScopeKind("spaces");
    }
  }, [opened]);

  const currentPage = store.state.pages.find((p) => p.id === currentPageId) ?? null;
  const pageScope = scopeKind === "page" && currentPage && PAGE_FORMATS.includes(format);
  const scope: ExportScope = pageScope
    ? { kind: "page", pageId: currentPage.id, withChildren }
    : { kind: "spaces", spaceIds: selected };

  const run = async () => {
    setBusy(true);
    setDone(null);
    try {
      const path = await exportToFile(store.state, format, scope);
      if (path && path !== "printed") {
        setDone(path);
        // Nur vollständige Sicherungen zählen für die Export-Erinnerung.
        if (format === "lt4docs") store.setSettings({ lastExportAt: new Date().toISOString() });
      }
    } catch (e) {
      if (e instanceof NothingToExportError) {
        notifications.show({ color: "yellow", message: e.message });
      } else {
        notifications.show({ color: "red", title: "Export fehlgeschlagen", message: errorText(e) });
      }
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
        <Radio.Group label="Format" value={format} onChange={(v) => setFormat(v as ExportFormat)}>
          <Stack gap="xs" mt={6}>
            <Radio
              value="lt4docs"
              label="LT4-Docs (.lt4docs) – verlustfrei, zum Import auf dem Server"
              description="Behält alle Formatierungen: Farben, Infoboxen, Tabellen, Aufgaben, Bilder."
            />
            <Radio
              value="docx"
              label="Word (.docx)"
              description="Ein Dokument, jede Seite beginnt mit ihrem Titel. Bilder und Tabellen bleiben erhalten."
            />
            <Radio
              value="pdf"
              label="PDF (über den Druckdialog)"
              description="Im Druckdialog „Als PDF speichern“ bzw. „Microsoft Print to PDF“ wählen."
            />
            <Radio
              value="xlsx"
              label="Excel (.xlsx) – nur Tabellen"
              description="Jede Tabelle wird ein eigenes Blatt, benannt nach der Seite. Erste Zeile fett."
            />
            <Radio
              value="markdown"
              label="Markdown (.zip) – für andere Programme"
              description="Farben und LT4-Blöcke gehen dabei verloren."
            />
          </Stack>
        </Radio.Group>

        {PAGE_FORMATS.includes(format) && currentPage && (
          <SegmentedControl
            value={scopeKind}
            onChange={(v) => setScopeKind(v as "spaces" | "page")}
            data={[
              { value: "spaces", label: "Bereiche" },
              { value: "page", label: `Seite „${currentPage.title || "Unbenannt"}“` },
            ]}
          />
        )}

        {pageScope ? (
          <Checkbox
            label="Unterseiten mitnehmen"
            checked={withChildren}
            onChange={(e) => setWithChildren(e.currentTarget.checked)}
          />
        ) : (
          <>
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
          </>
        )}
        <Group justify="flex-end">
          <Button
            leftSection={format === "pdf" ? <IconPrinter size={16} /> : <IconDownload size={16} />}
            loading={busy}
            disabled={!pageScope && !selected.length}
            onClick={run}
          >
            {format === "pdf" ? "Druckdialog öffnen" : "Exportieren"}
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
