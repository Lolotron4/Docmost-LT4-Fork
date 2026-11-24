// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import { Group, ScrollArea, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IBaseProperty } from "../../types/base.types";
import { newOptionId, nextOptionColor, optionsOf } from "../../base.utils";
import { BaseActions } from "../../queries/base-query";
import { OptionBadge } from "./option-badge";
import classes from "../base.module.css";

interface Props {
  prop: IBaseProperty;
  value: string[];
  multiple: boolean;
  actions: BaseActions;
  onChange: (ids: string[]) => void;
}

/** Auswahl mit Suche; neue Optionen lassen sich direkt anlegen. */
export function SelectPicker({ prop, value, multiple, actions, onChange }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const options = optionsOf(prop);
  const q = query.trim();
  const visible = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === q.toLowerCase());

  const toggle = (id: string) => {
    if (multiple) {
      onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    } else {
      onChange(value[0] === id ? [] : [id]);
    }
  };

  const create = async () => {
    if (!q || exact) return;
    const option = { id: newOptionId(), name: q, color: nextOptionColor(options) };
    await actions.updateProperty(prop.id, { typeOptions: { options: [...options, option] } });
    setQuery("");
    onChange(multiple ? [...value, option.id] : [option.id]);
  };

  return (
    <Stack gap={6} w={240}>
      <TextInput
        size="xs"
        autoFocus
        placeholder={t("Search or create an option")}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (visible.length === 1 && q) toggle(visible[0].id);
            else create();
          }
        }}
      />
      <ScrollArea.Autosize mah={240}>
        <Stack gap={2}>
          {visible.map((o) => (
            <UnstyledButton key={o.id} className={classes.option} onClick={() => toggle(o.id)}>
              <Group justify="space-between" wrap="nowrap" gap={6}>
                <OptionBadge option={o} />
                {value.includes(o.id) && <IconCheck size={14} />}
              </Group>
            </UnstyledButton>
          ))}
          {q && !exact && (
            <UnstyledButton className={classes.option} onClick={create}>
              <Group gap={6} wrap="nowrap">
                <IconPlus size={14} />
                <Text size="sm" truncate>
                  {t("Create")} „{q}“
                </Text>
              </Group>
            </UnstyledButton>
          )}
          {!q && options.length === 0 && (
            <Text size="xs" c="dimmed" px={6}>
              {t("Type to create the first option")}
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
