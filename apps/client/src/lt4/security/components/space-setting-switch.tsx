// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Gemeinsamer Schalter für die Sicherheits-Einstellungen eines Bereichs.
import { useEffect, useState } from "react";
import { Group, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types.ts";
import { useUpdateSpaceMutation } from "@/features/space/queries/space-query.ts";
import { useHasFeature } from "@/lt4/hooks/use-feature";

type Props = {
  space: ISpace;
  feature: string;
  title: string;
  description: string;
  value: boolean;
  field: "disablePublicSharing" | "disableExport" | "allowViewerComments";
  /** Hinweis, wenn der Workspace die Einstellung bereits global erzwingt. */
  lockedReason?: string | null;
};

export default function SpaceSettingSwitch({
  space,
  feature,
  title,
  description,
  value,
  field,
  lockedReason,
}: Props) {
  const { t } = useTranslation();
  const hasFeature = useHasFeature(feature);
  const mutation = useUpdateSpaceMutation();
  const [checked, setChecked] = useState(value);
  useEffect(() => setChecked(value), [value]);

  if (!hasFeature || !space) return null;

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.checked;
    setChecked(next);
    mutation.mutate(
      { spaceId: space.id, [field]: next },
      { onError: () => setChecked(!next) },
    );
  };

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t(title)}</Text>
        <Text size="sm" c="dimmed">
          {t(description)}
        </Text>
        {lockedReason && (
          <Text size="xs" c="orange" mt={4}>
            {lockedReason}
          </Text>
        )}
      </div>
      <Switch
        checked={checked}
        disabled={mutation.isPending}
        onChange={onChange}
        aria-label={t(title)}
      />
    </Group>
  );
}
