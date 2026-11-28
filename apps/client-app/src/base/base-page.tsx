// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Datenbank-Seite im Client: Titel + Oberfläche der Web-Version (Tabelle, Kanban, Kalender).
import { useEffect } from "react";
import { Menu } from "@mantine/core";
import { IconCalendar, IconLayoutKanban, IconTable } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseView } from "../../../client/src/lt4/base/components/base-view";
import type { BaseTemplate } from "../../../client/src/lt4/base/types/base.types";
import type { PageMeta } from "../lib/types";
import { useStore } from "../lib/store";
import { onBaseChanged } from "./local-base";

export function BasePage({ page }: { page: PageMeta }) {
  const store = useStore();
  const queryClient = useQueryClient();
  useEffect(() => {
    onBaseChanged((id) => store.touchPage(id));
    return () => onBaseChanged(null);
  }, [store.touchPage]);
  // Titeländerung in der Seitenleiste auch in der Datenbank-Ansicht zeigen
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["base", page.id] });
  }, [page.title, page.id, queryClient]);
  return (
    <div className="lt4-base-page">
      <BaseView key={page.id} pageId={page.id} editable />
    </div>
  );
}

export const BASE_TEMPLATES: { template: BaseTemplate; label: string; Icon: typeof IconTable }[] = [
  { template: "table", label: "Tabelle", Icon: IconTable },
  { template: "kanban", label: "Kanban-Board", Icon: IconLayoutKanban },
  { template: "calendar", label: "Kalender", Icon: IconCalendar },
];

/** Menüeinträge „Neue Datenbank“ (Tabelle, Kanban, Kalender). */
export function NewBaseItems({ onPick }: { onPick: (t: BaseTemplate) => void }) {
  return (
    <>
      {BASE_TEMPLATES.map(({ template, label, Icon }) => (
        <Menu.Item key={template} leftSection={<Icon size={14} />} onClick={() => onPick(template)}>
          {label}
        </Menu.Item>
      ))}
    </>
  );
}
