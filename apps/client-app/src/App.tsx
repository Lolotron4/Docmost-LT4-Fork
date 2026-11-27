// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Burger,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconDownload,
  IconExternalLink,
  IconLock,
  IconPlus,
  IconSettings,
  IconWorld,
} from "@tabler/icons-react";
import { errorText, openServerWindow, vault } from "./lib/native";
import { loadState, StoreProvider, useStore } from "./lib/store";
import { emptyState, type LockKind, type VaultStatus } from "./lib/types";
import { LockScreen, LockSetup } from "./components/lock";
import { Sidebar } from "./components/sidebar";
import { SettingsModal } from "./components/settings";
import { ExportModal } from "./components/export-modal";
import { PageEditor } from "./editor/page-editor";
import { Lt4Logo } from "./components/logo";
import { clearAttachmentCache } from "./editor/attachment-cache";

const EXPORT_REMINDER_DAYS = 14;

function Welcome({ onCreated }: { onCreated: (s: VaultStatus) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Center mih="100vh" p="md">
      <Stack w={460} maw="100%" gap="lg">
        <Stack align="center" gap={6}>
          <Lt4Logo size={56} />
          <Title order={2}>Willkommen bei LT4-Docs</Title>
          <Text c="dimmed" ta="center" size="sm">
            Deine Seiten liegen verschlüsselt auf diesem Gerät und funktionieren ganz ohne Internet
            und ohne Konto. Einen Server kannst du später in den Einstellungen hinzufügen.
          </Text>
        </Stack>
        <Text fw={600}>Wie soll die App gesperrt werden?</Text>
        <LockSetup
          submitLabel="Los geht's"
          busy={busy}
          onDone={async (kind: LockKind, secret?: string) => {
            setBusy(true);
            try {
              onCreated(await vault.create(kind, secret));
            } catch (e) {
              notifications.show({ color: "red", title: "Einrichten fehlgeschlagen", message: errorText(e) });
            } finally {
              setBusy(false);
            }
          }}
        />
      </Stack>
    </Center>
  );
}

function Main({
  status,
  setStatus,
  onLock,
  onWiped,
}: {
  status: VaultStatus;
  setStatus: (s: VaultStatus) => void;
  onLock: () => void;
  onWiped: () => void;
}) {
  const store = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [navOpen, nav] = useDisclosure(false);
  const [settingsOpen, settings] = useDisclosure(false);
  const [exportOpen, exportModal] = useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 48em)");

  // Beim ersten Start einen Bereich anlegen.
  useEffect(() => {
    if (store.state.spaces.length === 0) store.createSpace("Meine Notizen");
  }, []);

  const page = store.state.pages.find((p) => p.id === selectedId) ?? null;
  const select = (id: string) => {
    setSelectedId(id);
    if (isMobile) nav.close();
  };

  // Erinnerung, wenn seit 14 Tagen nicht exportiert wurde (gezählt ab der ältesten Seite).
  const lastExport = store.state.settings.lastExportAt;
  const oldestPage = store.state.pages.reduce<string | null>(
    (min, p) => (!min || p.createdAt < min ? p.createdAt : min),
    null,
  );
  const since = lastExport ?? oldestPage;
  const exportDue = !!since && Date.now() - Date.parse(since) > EXPORT_REMINDER_DAYS * 864e5;

  const defaultServer = store.state.servers.find((s) => s.isDefault);

  const newPage = () => {
    const space = page ? page.spaceId : store.state.spaces[0]?.id;
    if (!space) return;
    select(store.createPage(space, null).id);
  };

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 280, breakpoint: "sm", collapsed: { mobile: !navOpen } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={navOpen} onClick={nav.toggle} hiddenFrom="sm" size="sm" aria-label="Menü" />
            <Lt4Logo size={26} />
            <Text fw={700}>LT4-Docs</Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Neue Seite">
              <ActionIcon variant="subtle" size="lg" aria-label="Neue Seite" onClick={newPage}>
                <IconPlus size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Exportieren / Einlesen">
              <ActionIcon variant="subtle" size="lg" aria-label="Exportieren" onClick={exportModal.open}>
                <IconDownload size={18} />
              </ActionIcon>
            </Tooltip>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Tooltip label="Server">
                  <ActionIcon variant="subtle" size="lg" aria-label="Server">
                    <IconWorld size={18} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                {store.state.servers.length === 0 && <Menu.Label>Noch kein Server eingetragen</Menu.Label>}
                {store.state.servers.map((s) => (
                  <Menu.Item
                    key={s.id}
                    leftSection={<IconExternalLink size={14} />}
                    onClick={() =>
                      openServerWindow(s.url, s.name).catch((e) =>
                        notifications.show({ color: "red", message: errorText(e) }),
                      )
                    }
                  >
                    {s.name} öffnen{s.isDefault ? " (Standard)" : ""}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item leftSection={<IconSettings size={14} />} onClick={settings.open}>
                  Server verwalten …
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Tooltip label="Einstellungen">
              <ActionIcon variant="subtle" size="lg" aria-label="Einstellungen" onClick={settings.open}>
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
            {status.kind !== "none" && (
              <Tooltip label="Jetzt sperren">
                <ActionIcon variant="subtle" size="lg" aria-label="Sperren" onClick={onLock}>
                  <IconLock size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Sidebar selectedId={selectedId} onSelect={select} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="md" px={0}>
          {exportDue && (
            <Alert color="blue" mb="md" withCloseButton onClose={() => store.setSettings({ lastExportAt: new Date().toISOString() })}>
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm">
                  Deine Seiten gibt es nur auf diesem Gerät. Ein Export schützt sie, falls du den Code
                  vergisst oder das Gerät kaputtgeht.
                </Text>
                <Button size="xs" variant="light" onClick={exportModal.open}>
                  Exportieren
                </Button>
              </Group>
            </Alert>
          )}
          {page ? (
            <Stack gap="sm">
              <TextInput
                key={page.id}
                variant="unstyled"
                placeholder="Unbenannt"
                defaultValue={page.title}
                onChange={(e) => store.updatePage(page.id, { title: e.currentTarget.value })}
                styles={{ input: { fontSize: 32, fontWeight: 700, height: "auto", lineHeight: 1.3 } }}
                aria-label="Seitentitel"
              />
              <PageEditor page={page} />
            </Stack>
          ) : (
            <Center mih="60vh">
              <Stack align="center" gap="sm">
                <Text c="dimmed">Wähle links eine Seite oder lege eine neue an.</Text>
                <Button leftSection={<IconPlus size={16} />} onClick={newPage}>
                  Neue Seite
                </Button>
                {defaultServer && (
                  <Button
                    variant="subtle"
                    leftSection={<IconExternalLink size={16} />}
                    onClick={() => openServerWindow(defaultServer.url, defaultServer.name).catch(() => undefined)}
                  >
                    {defaultServer.name} öffnen
                  </Button>
                )}
              </Stack>
            </Center>
          )}
        </Container>
      </AppShell.Main>

      <SettingsModal
        opened={settingsOpen}
        onClose={settings.close}
        status={status}
        onStatus={setStatus}
        onWiped={onWiped}
      />
      <ExportModal opened={exportOpen} onClose={exportModal.close} />
    </AppShell>
  );
}

/** Sperrt nach X Minuten ohne Eingabe. */
function useIdleLock(minutes: number, enabled: boolean, onIdle: () => void) {
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || minutes <= 0) return;
    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(onIdle, minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [minutes, enabled, onIdle]);
}

function Unlocked({
  status,
  setStatus,
  onLocked,
  onWiped,
}: {
  status: VaultStatus;
  setStatus: (s: VaultStatus) => void;
  onLocked: () => void;
  onWiped: () => void;
}) {
  const [state, setState] = useState<ReturnType<typeof emptyState> | null>(null);
  useEffect(() => {
    loadState()
      .then(setState)
      .catch((e) => {
        notifications.show({ color: "red", title: "Daten konnten nicht geladen werden", message: errorText(e) });
        setState(emptyState());
      });
  }, []);
  if (!state) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  return (
    <StoreProvider initial={state}>
      <LockBridge status={status} setStatus={setStatus} onLocked={onLocked} onWiped={onWiped} />
    </StoreProvider>
  );
}

function LockBridge(props: {
  status: VaultStatus;
  setStatus: (s: VaultStatus) => void;
  onLocked: () => void;
  onWiped: () => void;
}) {
  const store = useStore();
  const lock = useCallback(async () => {
    await store.flush().catch(() => undefined);
    // Offene Eingaben (Editor speichert verzögert) kurz abwarten.
    await new Promise((r) => setTimeout(r, 700));
    await store.flush().catch(() => undefined);
    clearAttachmentCache();
    props.setStatus(await vault.lock());
    props.onLocked();
  }, [store, props]);
  useIdleLock(store.state.settings.autoLockMinutes, props.status.kind !== "none", lock);
  return <Main status={props.status} setStatus={props.setStatus} onLock={lock} onWiped={props.onWiped} />;
}

export default function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [session, setSession] = useState(0);

  const refresh = useCallback(async () => {
    try {
      let s = await vault.status();
      if (s.initialized && !s.unlocked && s.kind === "none") {
        s = await vault.unlock();
      }
      setStatus(s);
    } catch (e) {
      notifications.show({ color: "red", title: "Start fehlgeschlagen", message: errorText(e) });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!status) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!status.initialized) return <Welcome onCreated={setStatus} />;
  if (!status.unlocked) {
    return <LockScreen status={status} onUnlocked={setStatus} onReset={refresh} />;
  }
  return (
    <Unlocked
      key={session}
      status={status}
      setStatus={setStatus}
      onLocked={() => setSession((n) => n + 1)}
      onWiped={() => {
        clearAttachmentCache();
        setSession((n) => n + 1);
        refresh();
      }}
    />
  );
}
