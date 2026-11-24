// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/main.tsx";
import { getTemplate, getTemplatePermissions, listTemplates } from "../services/template-service";

export const TEMPLATES_KEY = ["lt4-templates"];

export function useTemplatesQuery(params: { query?: string; spaceId?: string; scope?: "workspace" }, enabled = true) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, "list", params],
    queryFn: () => listTemplates({ ...params, limit: 100 }),
    enabled,
  });
}

export function useTemplateQuery(templateId?: string) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, "info", templateId],
    queryFn: () => getTemplate(templateId!),
    enabled: !!templateId,
    staleTime: 0,
  });
}

export function useTemplatePermissionsQuery() {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, "permissions"],
    queryFn: getTemplatePermissions,
    staleTime: 30_000,
  });
}

export function prefetchTemplates(): void {
  queryClient.prefetchQuery({
    queryKey: [...TEMPLATES_KEY, "list", {}],
    queryFn: () => listTemplates({ limit: 100 }),
  });
}

export function invalidateTemplates() {
  return queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
}
