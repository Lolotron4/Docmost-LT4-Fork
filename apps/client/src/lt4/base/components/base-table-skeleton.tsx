// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Skeleton, Stack } from "@mantine/core";

export function BaseTableSkeleton({
  rows = 3,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <Stack gap={6}>
      {Array.from({ length: rows + 1 }).map((_, i) => (
        <Skeleton key={i} height={28} />
      ))}
    </Stack>
  );
}
