// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Status-Badge neben dem Seitentitel; ein Klick öffnet die Seitenprüfung.
import { useEffect } from "react";
import { Menu, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconRosetteDiscountCheck } from "@tabler/icons-react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { extractPageSlugId } from "@/lib";
import { useHasFeature } from "@/lt4/hooks/use-feature";
import { Feature } from "@/lt4/features";
import { usePageVerificationInfo } from "../queries";
import { PageVerificationModal } from "./page-verification-modal";
import { VerificationStateBadge } from "./verification-state";

function useCurrentPageId() {
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  return page?.isBase ? undefined : page?.id;
}

export function PageVerificationBadge(_props: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const pageId = useCurrentPageId();
  const { data: info } = usePageVerificationInfo(pageId);
  const [opened, { open, close }] = useDisclosure(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Aus Benachrichtigungen (?review=changes) direkt die Prüfung öffnen
  useEffect(() => {
    if (pageId && searchParams.get("review")) {
      open();
      const next = new URLSearchParams(searchParams);
      next.delete("review");
      setSearchParams(next, { replace: true });
    }
  }, [pageId, searchParams, setSearchParams, open]);

  if (!pageId) return null;
  return (
    <>
      {info?.verification && (
        <Tooltip label={t("Page review")} withArrow openDelay={250}>
          <UnstyledButton onClick={open} aria-label={t("Page review")}>
            <VerificationStateBadge state={info.verification.state} style={{ cursor: "pointer", textTransform: "none" }} />
          </UnstyledButton>
        </Tooltip>
      )}
      <PageVerificationModal pageId={pageId} opened={opened} onClose={close} />
    </>
  );
}

export function PageVerificationMenuItem({
  onClick,
}: {
  pageId?: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const enabled = useHasFeature(Feature.PAGE_VERIFICATION);
  if (!enabled) return null;
  return (
    <Menu.Item leftSection={<IconRosetteDiscountCheck size={16} />} onClick={onClick}>
      {t("Page review")}
    </Menu.Item>
  );
}
