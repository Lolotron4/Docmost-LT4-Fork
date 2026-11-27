// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Stack, Text } from "@mantine/core";

export const LT4_APP_NAME = "LT4-Docs";

type Lt4BrandProps = {
  /** Größe des Hauptschriftzugs (Kopfzeile "lg", Login-Seite "28px"). */
  size?: string;
  fw?: number;
};

/** Schriftzug "LT4-Docs" mit kleinem Hinweis "Based on Docmost" darunter. */
export function Lt4Brand({ size = "lg", fw = 600 }: Lt4BrandProps) {
  const large = size !== "lg";
  return (
    <Stack gap={0} style={{ userSelect: "none", lineHeight: 1.1 }}>
      <Text size={size} fw={fw} lh={1.1}>
        {LT4_APP_NAME}
      </Text>
      <Text
        fz={large ? 12 : 10}
        c="dimmed"
        lh={1.2}
        ta={large ? "center" : undefined}
      >
        Based on Docmost
      </Text>
    </Stack>
  );
}
