// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import * as svc from "../services/base-service";
import {
  BaseTemplate,
  CellValue,
  IBase,
  IBaseProperty,
  IBaseRow,
  IViewConfig,
  PropertyType,
  ViewType,
} from "../types/base.types";

export const baseKey = (pageId: string) => ["base", pageId];
export const rowsKey = (pageId: string) => ["base-rows", pageId];

// Andere Mitglieder sehen Änderungen nach kurzer Zeit (kein Live-Abgleich).
const REFRESH_MS = 15_000;

export function useBaseQuery(pageId: string) {
  return useQuery<IBase>({
    queryKey: baseKey(pageId),
    queryFn: () => svc.getBase(pageId),
    enabled: !!pageId,
    refetchInterval: REFRESH_MS,
    retry: 1,
  });
}

export function useBaseRowsQuery(pageId: string) {
  return useQuery({
    queryKey: rowsKey(pageId),
    queryFn: async () => (await svc.getBaseRows(pageId)).items,
    enabled: !!pageId,
    refetchInterval: REFRESH_MS,
  });
}

export function useConvertPageToBaseMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (args: { pageId: string; template?: BaseTemplate }) =>
      svc.convertPageToBase(args.pageId, args.template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["root-sidebar-pages"] });
    },
    onError: (err: any) =>
      notifications.show({
        message: t(err?.response?.data?.message ?? "Error"),
        color: "red",
      }),
  });
}

const byPosition = (a: IBaseRow, b: IBaseRow) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1;

/** Alle Änderungen an einer Datenbank, mit sofortiger Anzeige im Cache. */
export function useBaseActions(pageId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const fail = useCallback(
    (err: any) => {
      const m = err?.response?.data?.message;
      notifications.show({
        message: t(Array.isArray(m) ? m[0] : m ?? "Error"),
        color: "red",
      });
      queryClient.invalidateQueries({ queryKey: baseKey(pageId) });
      queryClient.invalidateQueries({ queryKey: rowsKey(pageId) });
    },
    [pageId, queryClient, t],
  );

  const setRows = useCallback(
    (fn: (rows: IBaseRow[]) => IBaseRow[]) =>
      queryClient.setQueryData<IBaseRow[]>(rowsKey(pageId), (old) =>
        fn(old ?? []).slice().sort(byPosition),
      ),
    [pageId, queryClient],
  );

  const setBase = useCallback(
    (fn: (base: IBase) => IBase) =>
      queryClient.setQueryData<IBase>(baseKey(pageId), (old) => (old ? fn(old) : old)),
    [pageId, queryClient],
  );

  const refreshBase = useCallback(
    () => queryClient.invalidateQueries({ queryKey: baseKey(pageId) }),
    [pageId, queryClient],
  );
  const refreshRows = useCallback(
    () => queryClient.invalidateQueries({ queryKey: rowsKey(pageId) }),
    [pageId, queryClient],
  );

  return useMemo(
    () => ({
      async updateCells(rowId: string, cells: Record<string, CellValue | null>) {
        await queryClient.cancelQueries({ queryKey: rowsKey(pageId) });
        setRows((rows) =>
          rows.map((r) => {
            if (r.id !== rowId) return r;
            const next = { ...r.cells };
            for (const [k, v] of Object.entries(cells)) {
              if (v === null || v === undefined || v === "") delete next[k];
              else next[k] = v;
            }
            return { ...r, cells: next };
          }),
        );
        try {
          const row = await svc.updateRow(pageId, rowId, cells);
          setRows((rows) => rows.map((r) => (r.id === rowId ? row : r)));
        } catch (err) {
          fail(err);
        }
      },

      async addRow(opts: { cells?: Record<string, CellValue>; afterRowId?: string; atStart?: boolean } = {}) {
        try {
          const row = await svc.createRow({ pageId, ...opts });
          setRows((rows) => [...rows, row]);
          return row;
        } catch (err) {
          fail(err);
          return null;
        }
      },

      async deleteRows(rowIds: string[]) {
        setRows((rows) => rows.filter((r) => !rowIds.includes(r.id)));
        try {
          await svc.deleteRows(pageId, rowIds);
        } catch (err) {
          fail(err);
        }
      },

      async moveRow(
        rowId: string,
        opts: { beforeRowId?: string | null; afterRowId?: string | null },
        cells?: Record<string, CellValue | null>,
      ) {
        await queryClient.cancelQueries({ queryKey: rowsKey(pageId) });
        // Vorläufig an die Zielstelle setzen, damit die Karte nicht springt.
        setRows((rows) => {
          const list = rows.filter((r) => r.id !== rowId);
          const moving = rows.find((r) => r.id === rowId);
          if (!moving) return rows;
          let idx = list.length;
          if (opts.beforeRowId) idx = list.findIndex((r) => r.id === opts.beforeRowId);
          else if (opts.afterRowId) idx = list.findIndex((r) => r.id === opts.afterRowId) + 1;
          const prev = list[idx - 1]?.position ?? "";
          const next = list[idx]?.position;
          const tmp = next ? prev + "\u0000" : prev + "~";
          let movedCells = moving.cells;
          if (cells) {
            movedCells = { ...moving.cells };
            for (const [k, v] of Object.entries(cells)) {
              if (v === null || v === undefined) delete movedCells[k];
              else movedCells[k] = v;
            }
          }
          return [...list, { ...moving, position: tmp, cells: movedCells }];
        });
        try {
          if (cells) await svc.updateRow(pageId, rowId, cells);
          const { position } = await svc.moveRow(pageId, rowId, opts);
          setRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, position } : r)));
        } catch (err) {
          fail(err);
        }
      },

      async addProperty(name: string, type: PropertyType, typeOptions?: IBaseProperty["typeOptions"]) {
        try {
          const prop = await svc.createProperty({ pageId, name, type, typeOptions });
          setBase((b) => ({ ...b, properties: [...b.properties, prop] }));
          return prop;
        } catch (err) {
          fail(err);
          return null;
        }
      },

      async updateProperty(
        propertyId: string,
        data: { name?: string; type?: PropertyType; typeOptions?: IBaseProperty["typeOptions"] },
      ) {
        setBase((b) => ({
          ...b,
          properties: b.properties.map((p) =>
            p.id === propertyId && !data.type ? { ...p, ...data } : p,
          ),
        }));
        try {
          const prop = await svc.updateProperty({ pageId, propertyId, ...data });
          setBase((b) => ({
            ...b,
            properties: b.properties.map((p) => (p.id === propertyId ? prop : p)),
          }));
          if (data.type || data.typeOptions) refreshRows();
        } catch (err) {
          fail(err);
        }
      },

      async deleteProperty(propertyId: string) {
        setBase((b) => ({ ...b, properties: b.properties.filter((p) => p.id !== propertyId) }));
        try {
          await svc.deleteProperty(pageId, propertyId);
          refreshRows();
        } catch (err) {
          fail(err);
        }
      },

      async moveProperty(propertyId: string, afterPropertyId: string | null) {
        try {
          await svc.moveProperty(pageId, propertyId, afterPropertyId);
          refreshBase();
        } catch (err) {
          fail(err);
        }
      },

      async addView(name: string, type: ViewType, config?: IViewConfig) {
        try {
          const view = await svc.createView({ pageId, name, type, config });
          setBase((b) => ({ ...b, views: [...b.views, view] }));
          return view;
        } catch (err) {
          fail(err);
          return null;
        }
      },

      async updateView(viewId: string, data: { name?: string; config?: IViewConfig }) {
        setBase((b) => ({
          ...b,
          views: b.views.map((v) => (v.id === viewId ? { ...v, ...data } : v)),
        }));
        try {
          await svc.updateView({ pageId, viewId, ...data });
        } catch (err) {
          fail(err);
        }
      },

      async deleteView(viewId: string) {
        try {
          await svc.deleteView(pageId, viewId);
          setBase((b) => ({ ...b, views: b.views.filter((v) => v.id !== viewId) }));
        } catch (err) {
          fail(err);
        }
      },
    }),
    [pageId, queryClient, setRows, setBase, fail, refreshBase, refreshRows],
  );
}

export type BaseActions = ReturnType<typeof useBaseActions>;
