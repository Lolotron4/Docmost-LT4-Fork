// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";
import { IPagination } from "@/lib/types";
import {
  ITemplate,
  ITemplatePermissions,
  TemplateVariableValues,
} from "../types/template.types";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const getTemplatePermissions = () =>
  post<ITemplatePermissions>("/templates/permissions");

export const listTemplates = (params: {
  spaceId?: string;
  scope?: "workspace";
  query?: string;
  cursor?: string;
  limit?: number;
}) => post<IPagination<ITemplate>>("/templates", params);

export const getTemplate = (templateId: string) =>
  post<ITemplate>("/templates/info", { templateId });

export const createTemplate = (data: {
  title?: string;
  description?: string;
  icon?: string;
  spaceId?: string | null;
  content?: unknown;
  fromPageId?: string;
}) => post<ITemplate>("/templates/create", data);

export const updateTemplate = (data: {
  templateId: string;
  title?: string;
  description?: string;
  icon?: string | null;
  spaceId?: string | null;
  content?: unknown;
}) => post<ITemplate>("/templates/update", data);

export const deleteTemplate = (templateId: string) =>
  post<void>("/templates/delete", { templateId });

/** Bereitet eine Vorlage für eine vorhandene leere Seite vor (Variablen, Anhänge). */
export async function applyTemplate(opts: {
  template: ITemplate;
  pageId: string;
  variableValues?: TemplateVariableValues;
}): Promise<ITemplate> {
  return post<ITemplate>("/templates/use", {
    templateId: opts.template.id,
    pageId: opts.pageId,
    variableValues: opts.variableValues,
  });
}

export const createPageFromTemplate = (data: {
  templateId: string;
  spaceId: string;
  parentPageId?: string;
  variableValues?: TemplateVariableValues;
}) =>
  post<{ id: string; slugId: string; spaceId: string; title: string | null }>(
    "/templates/create-page",
    data,
  );
