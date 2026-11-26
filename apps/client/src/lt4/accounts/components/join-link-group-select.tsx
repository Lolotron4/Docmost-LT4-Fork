// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { Group, MultiSelect, MultiSelectProps, Text } from "@mantine/core";
import { IconUsersGroup } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useGetGroupsQuery } from "@/features/group/queries/group-query.ts";
import { IGroup } from "@/features/group/types/group.types.ts";

type Option = { value: string; label: string };

const renderOption: MultiSelectProps["renderOption"] = ({ option }) => (
  <Group gap="sm" wrap="nowrap">
    <IconUsersGroup size={18} />
    <Text size="sm">{option.label}</Text>
  </Group>
);

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  /** Bereits gewählte Gruppen mit Namen (zum Anzeigen beim Bearbeiten). */
  initialGroups?: { id: string; name: string }[];
  label?: string;
  description?: string;
}

/** Gruppenauswahl mit Suche, kontrolliert (value/onChange). */
export function JoinLinkGroupSelect({
  value,
  onChange,
  initialGroups,
  label,
  description,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const { data: groups } = useGetGroupsQuery({ query: debounced, limit: 50 });
  const [options, setOptions] = useState<Option[]>(
    () => initialGroups?.map((g) => ({ value: g.id, label: g.name })) ?? [],
  );

  useEffect(() => {
    if (!groups) return;
    // Die Standardgruppe ("Jeder") bekommt ohnehin jedes neue Konto.
    const fresh = groups.items
      .filter((group: IGroup) => !group.isDefault)
      .map((group: IGroup) => ({ value: group.id, label: group.name }));
    setOptions((prev) => [
      ...prev,
      ...fresh.filter((o) => !prev.some((p) => p.value === o.value)),
    ]);
  }, [groups]);

  return (
    <MultiSelect
      label={label ?? t("Add to groups")}
      description={description}
      placeholder={value.length ? undefined : t("Search for groups")}
      data={options}
      value={value}
      onChange={onChange}
      renderOption={renderOption}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      hidePickedOptions
      clearable
      maxValues={50}
      maxDropdownHeight={260}
      nothingFoundMessage={t("No group found")}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
