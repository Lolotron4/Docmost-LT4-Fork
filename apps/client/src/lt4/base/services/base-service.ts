// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";
import {
  BaseTemplate,
  CellValue,
  IBase,
  IBaseProperty,
  IBaseRow,
  IBaseView,
  IViewConfig,
  PropertyType,
  ViewType,
} from "../types/base.types";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const getBase = (pageId: string) => post<IBase>("/bases/info", { pageId });
export const getBaseRows = (pageId: string) =>
  post<{ items: IBaseRow[] }>("/bases/rows", { pageId });

export const convertPageToBase = (pageId: string, template?: BaseTemplate) =>
  post<{ id: string; slugId: string }>("/bases/convert", { pageId, template });

export const createProperty = (data: {
  pageId: string;
  name: string;
  type: PropertyType;
  typeOptions?: IBaseProperty["typeOptions"];
  afterPropertyId?: string;
}) => post<IBaseProperty>("/bases/properties/create", data);

export const updateProperty = (data: {
  pageId: string;
  propertyId: string;
  name?: string;
  type?: PropertyType;
  typeOptions?: IBaseProperty["typeOptions"];
}) => post<IBaseProperty>("/bases/properties/update", data);

export const deleteProperty = (pageId: string, propertyId: string) =>
  post<void>("/bases/properties/delete", { pageId, propertyId });

export const moveProperty = (pageId: string, propertyId: string, afterPropertyId: string | null) =>
  post<void>("/bases/properties/move", { pageId, propertyId, afterPropertyId });

export const createRow = (data: {
  pageId: string;
  cells?: Record<string, CellValue | null>;
  afterRowId?: string;
  atStart?: boolean;
}) => post<IBaseRow>("/bases/rows/create", data);

export const updateRow = (pageId: string, rowId: string, cells: Record<string, CellValue | null>) =>
  post<IBaseRow>("/bases/rows/update", { pageId, rowId, cells });

export const deleteRows = (pageId: string, rowIds: string[]) =>
  post<void>("/bases/rows/delete", { pageId, rowIds });

export const moveRow = (
  pageId: string,
  rowId: string,
  opts: { beforeRowId?: string | null; afterRowId?: string | null },
) => post<{ position: string }>("/bases/rows/move", { pageId, rowId, ...opts });

export const createView = (data: {
  pageId: string;
  name: string;
  type: ViewType;
  config?: IViewConfig;
}) => post<IBaseView>("/bases/views/create", data);

export const updateView = (data: {
  pageId: string;
  viewId: string;
  name?: string;
  config?: IViewConfig;
}) => post<IBaseView>("/bases/views/update", data);

export const deleteView = (pageId: string, viewId: string) =>
  post<void>("/bases/views/delete", { pageId, viewId });
