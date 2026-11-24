// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Zeigt aktive Ankündigungen als farbige Leisten oben an.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActionIcon, Anchor, Box, Group, Text } from "@mantine/core";
import { IconSpeakerphone, IconX } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useHasFeature } from "@/lt4/hooks/use-feature";
import { Feature } from "@/lt4/features";
import { announcementBannersHeightAtom } from "../atoms/announcement-atoms";
import {
  getCurrentAnnouncements,
  getPublicAnnouncements,
  IAnnouncement,
} from "../services/announcement-service";
import classes from "./announcement-banners.module.css";

const DISMISSED_KEY = "lt4-dismissed-announcements";

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

function writeDismissed(value: Record<string, string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(value));
  } catch {
    /* privates Fenster o. Ä. */
  }
}

/** Text mit klickbaren Links (http/https). */
export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <Anchor key={i} href={part} target="_blank" rel="noopener noreferrer" inherit c="inherit" underline="always">
            {part}
          </Anchor>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function AnnouncementBar({
  announcement,
  onDismiss,
}: {
  announcement: Pick<IAnnouncement, "title" | "textContent" | "color" | "isDismissible">;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box className={classes.bar} data-color={announcement.color} role="status">
      <Group gap="xs" wrap="nowrap" justify="center" className={classes.inner}>
        <IconSpeakerphone size={16} className={classes.icon} />
        <Text size="sm" className={classes.text}>
          <b>{announcement.title}</b>
          {announcement.textContent && (
            <>
              {" "}
              <LinkifiedText text={announcement.textContent} />
            </>
          )}
        </Text>
      </Group>
      {announcement.isDismissible && onDismiss && (
        <ActionIcon
          variant="subtle"
          color="dark"
          size="sm"
          className={classes.close}
          onClick={onDismiss}
          aria-label={t("Hide announcement")}
        >
          <IconX size={14} />
        </ActionIcon>
      )}
    </Box>
  );
}

export default function AnnouncementBanners({
  surface = "app",
  onHeightChange,
}: {
  surface?: string;
  onHeightChange?: (height: number) => void;
}) {
  const isPublic = surface !== "app";
  const hasFeature = useHasFeature(Feature.ANNOUNCEMENTS);
  const setHeightAtom = useSetAtom(announcementBannersHeightAtom);
  const ref = useRef<HTMLDivElement | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, string>>(readDismissed);

  const { data } = useQuery({
    queryKey: ["lt4-announcements", isPublic ? "public" : "app"],
    queryFn: isPublic ? getPublicAnnouncements : getCurrentAnnouncements,
    // Auf öffentlichen Seiten ist der Feature-Status ggf. unbekannt; der Server filtert selbst
    enabled: isPublic || hasFeature,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: false,
  });

  const visible = (data ?? []).filter((a) => dismissed[a.id] !== a.updatedAt);

  useLayoutEffect(() => {
    const el = ref.current;
    const report = (h: number) => {
      setHeightAtom(h);
      onHeightChange?.(h);
    };
    if (!el) {
      report(0);
      return;
    }
    const ro = new ResizeObserver(() => report(el.offsetHeight));
    ro.observe(el);
    report(el.offsetHeight);
    return () => ro.disconnect();
  }, [visible.length, onHeightChange, setHeightAtom]);

  useEffect(() => () => setHeightAtom(0), [setHeightAtom]);

  if (visible.length === 0) return null;

  const dismiss = (a: IAnnouncement) => {
    const next = { ...readDismissed(), [a.id]: a.updatedAt };
    writeDismissed(next);
    setDismissed(next);
  };

  return (
    <div ref={ref} className={classes.stack}>
      {visible.map((a) => (
        <AnnouncementBar key={a.id} announcement={a} onDismiss={() => dismiss(a)} />
      ))}
    </div>
  );
}
