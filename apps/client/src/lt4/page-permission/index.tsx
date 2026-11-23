// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { ActionIcon, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLock, IconUsers } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import ShareModal from "@/features/share/components/share-modal.tsx";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { extractPageSlugId } from "@/lib";
import { useHasFeature } from "@/lt4/hooks/use-feature";
import { Feature } from "@/lt4/features";
import { PagePermissionModal } from "./page-permission-modal";

/**
 * Teilen-Bereich im Seitenkopf: öffentliches Teilen (Kern) plus Seitenzugriff
 * (LT4). Das Schloss zeigt an, ob die Seite eingeschränkt ist.
 */
export function PageShareModal({ readOnly }: { readOnly: boolean }) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const hasPagePermissions = useHasFeature(Feature.PAGE_PERMISSIONS);
  const [opened, { open, close }] = useDisclosure(false);

  const restricted = page?.permissions?.hasRestriction ?? false;
  const label = restricted ? t("Restricted page access") : t("Page access");

  return (
    <>
      {hasPagePermissions && page && (
        <>
          <Tooltip label={label} openDelay={250} withArrow>
            <ActionIcon
              variant="subtle"
              color={restricted ? "orange" : "dark"}
              aria-label={label}
              onClick={open}
            >
              {restricted ? (
                <IconLock size={20} stroke={2} />
              ) : (
                <IconUsers size={20} stroke={2} />
              )}
            </ActionIcon>
          </Tooltip>
          {opened && (
            <PagePermissionModal page={page} opened={opened} onClose={close} />
          )}
        </>
      )}
      <ShareModal readOnly={readOnly} />
    </>
  );
}
