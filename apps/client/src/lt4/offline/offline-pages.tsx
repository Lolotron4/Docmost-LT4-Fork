// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCloudCheck,
  IconCloudOff,
  IconExternalLink,
  IconFileText,
  IconHome,
  IconTrash,
  IconWifi,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import ReadonlyPageEditor from "@/features/editor/readonly-page-editor";
import { buildPageUrl } from "@/features/page/page.utils";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { useOnlineStatus } from "./use-online-status";
import { InstallAppCard } from "./install-app";
import {
  RECENT_LIMIT,
  clearRecentPages,
  getOfflinePage,
  getStoredUserId,
  isAutoSaveEnabled,
  listOfflinePages,
  onOfflineChanged,
  removeOfflinePage,
  setAutoSaveEnabled,
  type OfflinePage,
} from "./offline-store";

function useOfflineList(userId: string | null) {
  const [pages, setPages] = useState<OfflinePage[] | null>(null);
  useEffect(() => {
    if (!userId) {
      setPages([]);
      return;
    }
    let active = true;
    const load = () => listOfflinePages(userId).then((p) => active && setPages(p));
    load();
    const off = onOfflineChanged(load);
    return () => {
      active = false;
      off();
    };
  }, [userId]);
  return pages;
}

function formatTime(ts: number | string | null | undefined, lang: string) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function StatusBadge({ online }: { online: boolean }) {
  const { t } = useTranslation();
  return online ? (
    <Badge color="green" variant="light" leftSection={<IconWifi size={12} />}>
      {t("Online")}
    </Badge>
  ) : (
    <Badge color="orange" variant="light" leftSection={<IconCloudOff size={12} />}>
      {t("Offline")}
    </Badge>
  );
}

function Shell({ children, back }: { children: React.ReactNode; back?: React.ReactNode }) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  return (
    <Box mih="100dvh" bg="var(--mantine-color-body)">
      <Box
        component="header"
        px="md"
        py="xs"
        style={{
          borderBottom: "1px solid var(--mantine-color-default-border)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--mantine-color-body)",
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {back}
            <IconCloudCheck size={20} />
            <Text fw={600}>{t("Offline pages")}</Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <StatusBadge online={online} />
            {online && (
              <Button
                component={Link}
                to="/home"
                size="xs"
                variant="default"
                leftSection={<IconHome size={14} />}
              >
                {t("Back to app")}
              </Button>
            )}
          </Group>
        </Group>
      </Box>
      {children}
    </Box>
  );
}

function PageRow({ page, userId }: { page: OfflinePage; userId: string }) {
  const { t, i18n } = useTranslation();
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="nowrap" align="center">
        <UnstyledButton
          component={Link}
          to={`/offline/${page.slugId || page.pageId}`}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Group gap="sm" wrap="nowrap">
            <Text size="lg" w={24} ta="center">
              {page.icon || <IconFileText size={18} />}
            </Text>
            <Box style={{ minWidth: 0 }}>
              <Text fw={500} truncate>
                {page.title || t("Untitled")}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {[page.spaceName, t("Saved {{time}}", { time: formatTime(page.savedAt, i18n.language) })]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Box>
          </Group>
        </UnstyledButton>
        <Tooltip label={t("Remove from this device")} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t("Remove from this device")}
            onClick={() => removeOfflinePage(userId, page.pageId)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
}

export function OfflinePagesList() {
  const { t } = useTranslation();
  const userId = getStoredUserId();
  const pages = useOfflineList(userId);
  const online = useOnlineStatus();
  const [auto, setAuto] = useState(isAutoSaveEnabled());
  const pinned = useMemo(() => pages?.filter((p) => p.pinned) ?? [], [pages]);
  const recent = useMemo(() => pages?.filter((p) => !p.pinned) ?? [], [pages]);

  return (
    <Shell>
      <DocumentTitle title={t("Offline pages")} />
      <Container size="sm" py="lg">
        <Stack gap="lg">
          {!online && (
            <Alert color="orange" icon={<IconCloudOff size={18} />} title={t("You are offline")}>
              {t("You can read the pages saved on this device. Editing is possible again once you are back online.")}
            </Alert>
          )}

          {!userId && (
            <Alert color="gray">
              {t("Sign in once while online so pages can be saved on this device.")}
            </Alert>
          )}

          {userId && (
            <>
              <Stack gap="xs">
                <Title order={4}>{t("Kept offline")}</Title>
                {pinned.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('No pages yet. Open a page and choose "Make available offline" in the page menu (⋯).')}
                  </Text>
                ) : (
                  pinned.map((p) => <PageRow key={p.key} page={p} userId={userId} />)
                )}
              </Stack>

              <Stack gap="xs">
                <Group justify="space-between">
                  <Title order={4}>{t("Recently visited")}</Title>
                  {recent.length > 0 && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => clearRecentPages(userId)}
                    >
                      {t("Clear")}
                    </Button>
                  )}
                </Group>
                {recent.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {auto
                      ? t("Pages you open are saved here automatically.")
                      : t("Automatic saving is turned off.")}
                  </Text>
                ) : (
                  recent.map((p) => <PageRow key={p.key} page={p} userId={userId} />)
                )}
              </Stack>

              <InstallAppCard />

              <Paper withBorder radius="md" p="md">
                <Switch
                  checked={auto}
                  onChange={(e) => {
                    setAuto(e.currentTarget.checked);
                    setAutoSaveEnabled(e.currentTarget.checked);
                  }}
                  label={t("Save recently visited pages automatically")}
                  description={t(
                    "Keeps the last {{count}} pages you opened on this device. Everything is removed when you sign out.",
                    { count: RECENT_LIMIT },
                  )}
                />
              </Paper>
            </>
          )}
        </Stack>
      </Container>
    </Shell>
  );
}

export function OfflinePageReader() {
  const { t, i18n } = useTranslation();
  const { pageKey } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const userId = getStoredUserId();
  const [page, setPage] = useState<OfflinePage | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getOfflinePage(userId ?? "", pageKey ?? "").then((p) => active && setPage(p));
    return () => {
      active = false;
    };
  }, [userId, pageKey]);

  const back = (
    <ActionIcon variant="subtle" color="gray" aria-label={t("Back")} onClick={() => navigate("/offline")}>
      <IconArrowLeft size={18} />
    </ActionIcon>
  );

  if (page === undefined) return <Shell back={back}>{null}</Shell>;

  if (!page) {
    return (
      <Shell back={back}>
        <Container size="sm" py="lg">
          <Alert color="gray" title={t("This page is not saved on this device")}>
            {online
              ? t("Open it in the app to read it.")
              : t("Pages you opened before or kept offline can be read without a connection.")}
          </Alert>
        </Container>
      </Shell>
    );
  }

  return (
    <Shell back={back}>
      <DocumentTitle title={`${page.icon || ""} ${page.title || t("Untitled")}`} withAppName={false} />
      <Container size="md" py="md">
        <Group justify="space-between" mb="xs" wrap="wrap" gap="xs">
          <Text size="sm" c="dimmed">
            {[
              page.spaceName,
              t("Saved {{time}}", { time: formatTime(page.savedAt, i18n.language) }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {online && page.spaceSlug && (
            <Button
              component={Link}
              to={buildPageUrl(page.spaceSlug, page.slugId, page.title)}
              size="xs"
              variant="light"
              leftSection={<IconExternalLink size={14} />}
            >
              {t("Open in app")}
            </Button>
          )}
        </Group>
        {!online && (
          <Alert color="orange" icon={<IconCloudOff size={18} />} mb="md" py="xs">
            {t("Offline copy, read only. Changes made since then are not shown.")}
          </Alert>
        )}
        <Box className="lt4-offline-reader">
          <ReadonlyPageEditor
            key={page.key}
            title={page.title}
            content={page.content}
            pageId={page.pageId}
            withLightbox
          />
        </Box>
      </Container>
    </Shell>
  );
}

export default OfflinePagesList;
