// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IconAlignLeft,
  IconCalendar,
  IconCircleChevronDown,
  IconHash,
  IconLink,
  IconList,
  IconMathFunction,
  IconSquareCheck,
} from "@tabler/icons-react";
import { PropertyType } from "../../types/base.types";

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multiSelect: "Multi-select",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
  formula: "Formula",
};

export function PropertyIcon({ type, size = 14 }: { type: PropertyType; size?: number }) {
  const props = { size, stroke: 1.7 };
  switch (type) {
    case "number":
      return <IconHash {...props} />;
    case "select":
      return <IconCircleChevronDown {...props} />;
    case "multiSelect":
      return <IconList {...props} />;
    case "date":
      return <IconCalendar {...props} />;
    case "checkbox":
      return <IconSquareCheck {...props} />;
    case "url":
      return <IconLink {...props} />;
    case "formula":
      return <IconMathFunction {...props} />;
    default:
      return <IconAlignLeft {...props} />;
  }
}
