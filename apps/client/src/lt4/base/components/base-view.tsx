// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Platzhalter: Dieses Feature ist im LT4-Fork noch nicht gebaut.
// Bases folgen in Phase 1, Schritt 4.
import { ReactNode } from "react";
import { Alert, Box } from "@mantine/core";
import { useTranslation } from "react-i18next";

function NotAvailable() {
  const { t } = useTranslation();
  return (
    <Alert variant="light" color="gray" my="sm">
      {t("Databases are not available yet in this edition")}
    </Alert>
  );
}

export function BaseView(_props: {
  pageId: string;
  embedded?: boolean;
  editable?: boolean;
}) {
  return <NotAvailable />;
}

export function BasePageView(props: {
  page: unknown;
  editable?: boolean;
  titleSlot?: ReactNode;
}) {
  return (
    <Box>
      {props.titleSlot}
      <NotAvailable />
    </Box>
  );
}
