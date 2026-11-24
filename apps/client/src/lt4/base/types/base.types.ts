// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export type BaseTemplate = "table" | "kanban" | "calendar" | "form";

export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "multiSelect"
  | "date"
  | "checkbox"
  | "url"
  | "formula";

export const PROPERTY_TYPES: PropertyType[] = [
  "text",
  "number",
  "select",
  "multiSelect",
  "date",
  "checkbox",
  "url",
  "formula",
];

export type ViewType = "table" | "kanban" | "calendar";

export const OPTION_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export interface ISelectOption {
  id: string;
  name: string;
  color: string;
}

export interface IBaseProperty {
  id: string;
  name: string;
  type: PropertyType;
  position: string;
  typeOptions: {
    options?: ISelectOption[];
    /** Datum: auch Uhrzeit (und Ende) erfassen */
    includeTime?: boolean;
    /** Formel, z. B. "{Punkte} / {Max} * 100" */
    expression?: string;
  } | null;
  isPrimary: boolean;
}

export interface IViewSort {
  propertyId: string;
  direction: "asc" | "desc";
}

export type FilterOperator =
  | "contains"
  | "is"
  | "isNot"
  | "isEmpty"
  | "isNotEmpty"
  | "checked"
  | "unchecked";

export interface IViewFilter {
  propertyId: string;
  operator: FilterOperator;
  value?: string;
}

export interface IViewConfig {
  sorts?: IViewSort[];
  filters?: IViewFilter[];
  hiddenPropertyIds?: string[];
  propertyWidths?: Record<string, number>;
  groupByPropertyId?: string;
  datePropertyId?: string;
  hiddenGroups?: string[];
}

export interface IBaseView {
  id: string;
  name: string;
  type: ViewType;
  position: string;
  config: IViewConfig;
}

export interface IBase {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceId: string;
  properties: IBaseProperty[];
  views: IBaseView[];
  permissions: { canEdit: boolean };
}

export type CellValue =
  | string
  | number
  | boolean
  | string[]
  | IDateValue
  | { formulaError: string }
  | undefined;

/** "YYYY-MM-DD" oder mit Uhrzeit "YYYY-MM-DDTHH:mm" (Ortszeit) */
export interface IDateValue {
  start: string;
  end?: string;
}

export interface IBaseRow {
  id: string;
  cells: Record<string, CellValue>;
  position: string;
  createdAt: string;
  updatedAt: string;
  creatorId: string | null;
  lastUpdatedById: string | null;
}
