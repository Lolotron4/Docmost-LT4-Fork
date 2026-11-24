// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Alert, Box, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useBaseActions, useBaseQuery, useBaseRowsQuery } from "../queries/base-query";
import { IBaseView, IViewConfig } from "../types/base.types";
import { applyView } from "../base.utils";
import { computeFormulas } from "../formula";
import { BaseTableSkeleton } from "./base-table-skeleton";
import { ViewToolbar } from "./view-toolbar";
import { BaseTable } from "./table/base-table";
import { KanbanBoard } from "./kanban/kanban-board";
import { CalendarMonth } from "./calendar/calendar-month";
import { RowModal } from "./row-modal";
import classes from "./base.module.css";

const viewStoreKey = (pageId: string) => `lt4-base-view:${pageId}`;

function readStoredView(pageId: string) {
  try {
    return localStorage.getItem(viewStoreKey(pageId));
  } catch {
    return null;
  }
}

export function BaseView({
  pageId,
  embedded,
  editable = false,
}: {
  pageId: string;
  embedded?: boolean;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  const { data: base, isLoading, isError } = useBaseQuery(pageId);
  const { data: rows } = useBaseRowsQuery(pageId);
  const serverActions = useBaseActions(pageId);
  const canEdit = editable && !!base?.permissions?.canEdit;

  const [viewId, setViewId] = useState<string | null>(() => readStoredView(pageId));
  const [search, setSearch] = useState("");
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Leser dürfen Ansichten nur für sich anpassen (wird nicht gespeichert).
  const [localConfigs, setLocalConfigs] = useState<Record<string, IViewConfig>>({});

  const actions = useMemo(
    () =>
      canEdit
        ? serverActions
        : {
            ...serverActions,
            updateView: async (id: string, data: { name?: string; config?: IViewConfig }) => {
              if (data.config) setLocalConfigs((c) => ({ ...c, [id]: data.config! }));
            },
          },
    [canEdit, serverActions],
  );

  const view: IBaseView | undefined = useMemo(() => {
    if (!base?.views.length) return undefined;
    const v = base.views.find((x) => x.id === viewId) ?? base.views[0];
    return localConfigs[v.id] ? { ...v, config: localConfigs[v.id] } : v;
  }, [base, viewId, localConfigs]);

  useEffect(() => {
    if (!view) return;
    try {
      localStorage.setItem(viewStoreKey(pageId), view.id);
    } catch {
      /* egal */
    }
  }, [pageId, view?.id]);

  const visibleProps = useMemo(() => {
    if (!base || !view) return [];
    const hidden = new Set(view.config.hiddenPropertyIds ?? []);
    return base.properties.filter((p) => p.isPrimary || !hidden.has(p.id));
  }, [base, view]);

  // Formel-Spalten werden hier berechnet und wie normale Zellen behandelt.
  const computedRows = useMemo(() => {
    if (!base || !rows) return rows;
    const results = computeFormulas(rows, base.properties);
    if (!results.size) return rows;
    return rows.map((row) => {
      const r = results.get(row.id);
      if (!r) return row;
      const cells = { ...row.cells };
      for (const [id, res] of Object.entries(r)) {
        cells[id] = "error" in res ? { formulaError: res.error } : (res.value ?? undefined);
      }
      return { ...row, cells };
    });
  }, [base, rows]);

  const shownRows = useMemo(
    () =>
      base && view && computedRows
        ? applyView(computedRows, base.properties, view.config, search)
        : [],
    [base, view, computedRows, search],
  );

  if (isError) {
    return (
      <Alert variant="light" color="gray" my="sm">
        {t("This database could not be loaded or you don't have access to it.")}
      </Alert>
    );
  }
  if (isLoading || !base || !view || !rows) return <BaseTableSkeleton rows={3} />;

  const openRow = (computedRows ?? rows).find((r) => r.id === openRowId) ?? null;
  const filtered = (view.config.filters?.length ?? 0) > 0 || !!search.trim();
  const sorted = (view.config.sorts?.length ?? 0) > 0;

  const addRow = async () => {
    // Neue Zeilen erfüllen einfache "ist"-Filter, damit sie nicht sofort verschwinden.
    const cells: Record<string, any> = {};
    for (const f of view.config.filters ?? []) {
      const p = base.properties.find((x) => x.id === f.propertyId);
      if (!p || f.operator !== "is" || !f.value) continue;
      cells[p.id] = p.type === "multiSelect" ? [f.value] : f.value;
    }
    const row = await actions.addRow({ cells });
    if (row && (view.type !== "table" || filtered || sorted)) setOpenRowId(row.id);
  };

  let body: ReactNode;
  if (view.type === "kanban") {
    body = (
      <KanbanBoard base={base} view={view} properties={visibleProps} rows={shownRows} editable={canEdit} actions={actions} onOpenRow={setOpenRowId} />
    );
  } else if (view.type === "calendar") {
    body = <CalendarMonth base={base} view={view} rows={shownRows} editable={canEdit} actions={actions} onOpenRow={setOpenRowId} />;
  } else {
    body = (
      <BaseTable
        base={base}
        view={view}
        properties={visibleProps}
        rows={shownRows}
        editable={canEdit}
        actions={actions}
        onOpenRow={setOpenRowId}
        onAddRow={addRow}
        canAddRow
      />
    );
  }

  return (
    <div className={classes.root} data-embedded={embedded || undefined} style={embedded ? undefined : { flex: 1 }}>
      <ViewToolbar
        base={base}
        view={view}
        editable={canEdit}
        actions={actions}
        onSelectView={setViewId}
        search={search}
        onSearch={setSearch}
        onNew={addRow}
      />
      {filtered && shownRows.length === 0 && rows.length > 0 && (
        <Text size="sm" c="dimmed" py="xs">
          {t("No entries match the filter.")}
        </Text>
      )}
      <div className={embedded ? classes.scroller : classes.fill}>{body}</div>
      <RowModal
        row={openRow}
        properties={base.properties}
        editable={canEdit}
        actions={actions}
        onClose={() => setOpenRowId(null)}
      />
    </div>
  );
}

export function BasePageView(props: { page: any; editable?: boolean; titleSlot?: ReactNode }) {
  return (
    <Box style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {props.titleSlot}
      <BaseView pageId={props.page.id} editable={props.editable} />
    </Box>
  );
}
