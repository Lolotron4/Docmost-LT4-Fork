// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Badge } from "@mantine/core";
import { ISelectOption } from "../../types/base.types";

export function OptionBadge({ option, size = "sm" }: { option: ISelectOption; size?: "xs" | "sm" | "md" }) {
  return (
    <Badge
      color={option.color}
      variant="light"
      size={size}
      radius="sm"
      tt="none"
      fw={500}
      style={{ maxWidth: "100%" }}
    >
      {option.name}
    </Badge>
  );
}
