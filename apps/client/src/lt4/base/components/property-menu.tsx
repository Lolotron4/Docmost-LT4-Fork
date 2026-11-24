// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { ReactNode, useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  ColorSwatch,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconEyeOff,
  IconList,
  IconSortAscending,
  IconSortDescending,
  IconTrash,
  IconTransform,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import {
  IBaseProperty,
  ISelectOption,
  OPTION_COLORS,
  PROPERTY_TYPES,
  PropertyType,
} from "../types/base.types";
import { BaseActions } from "../queries/base-query";
import { newOptionId, nextOptionColor, optionsOf } from "../base.utils";
import { PROPERTY_LABELS, PropertyIcon } from "./cells/property-icon";

interface Props {
  prop: IBaseProperty;
  actions: BaseActions;
  editable: boolean;
  children: ReactNode;
  onSort: (direction: "asc" | "desc") => void;
  onHide: () => void;
  onMove?: (direction: -1 | 1) => void;
}

export function PropertyMenu({ prop, actions, editable, children, onSort, onHide, onMove }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState(prop.name);
  const [optionsOpen, setOptionsOpen] = useState(false);
  useEffect(() => setName(prop.name), [prop.name, opened]);

  const rename = () => {
    const next = name.trim();
    if (next && next !== prop.name) actions.updateProperty(prop.id, { name: next });
  };

  const changeType = (type: PropertyType) => {
    if (type === prop.type) return;
    modals.openConfirmModal({
      title: t("Change property type"),
      centered: true,
      children: (
        <Text size="sm">
          {t("Existing values are converted to {{type}}. Values that do not fit are removed.", {
            type: t(PROPERTY_LABELS[type]),
          })}
        </Text>
      ),
      labels: { confirm: t("Change"), cancel: t("Cancel") },
      onConfirm: () => actions.updateProperty(prop.id, { type }),
    });
  };

  const remove = () =>
    modals.openConfirmModal({
      title: t("Delete property"),
      centered: true,
      children: (
        <Text size="sm">
          {t('The property "{{name}}" and all its values will be deleted.', { name: prop.name })}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => actions.deleteProperty(prop.id),
    });

  return (
    <>
      <Menu
        opened={opened}
        onChange={(o) => {
          if (!o) rename();
          setOpened(o);
        }}
        position="bottom-start"
        width={240}
        withinPortal
        closeOnItemClick
      >
        <Menu.Target>{children}</Menu.Target>
        <Menu.Dropdown>
          {editable && (
            <>
              <div style={{ padding: "4px 6px 6px" }}>
                <TextInput
                  size="xs"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      rename();
                      setOpened(false);
                    }
                  }}
                  aria-label={t("Property name")}
                />
              </div>
              {!prop.isPrimary && (
                <Menu.Sub position="right-start">
                  <Menu.Sub.Target>
                    <Menu.Sub.Item leftSection={<IconTransform size={14} />}>
                      {t("Type")}: {t(PROPERTY_LABELS[prop.type])}
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown>
                    {PROPERTY_TYPES.map((type) => (
                      <Menu.Item
                        key={type}
                        leftSection={<PropertyIcon type={type} />}
                        onClick={() => changeType(type)}
                        fw={type === prop.type ? 600 : undefined}
                      >
                        {t(PROPERTY_LABELS[type])}
                      </Menu.Item>
                    ))}
                  </Menu.Sub.Dropdown>
                </Menu.Sub>
              )}
              {(prop.type === "select" || prop.type === "multiSelect") && (
                <Menu.Item leftSection={<IconList size={14} />} onClick={() => setOptionsOpen(true)}>
                  {t("Edit options")}
                </Menu.Item>
              )}
              <Menu.Divider />
            </>
          )}
          <Menu.Item leftSection={<IconSortAscending size={14} />} onClick={() => onSort("asc")}>
            {t("Sort ascending")}
          </Menu.Item>
          <Menu.Item leftSection={<IconSortDescending size={14} />} onClick={() => onSort("desc")}>
            {t("Sort descending")}
          </Menu.Item>
          {!prop.isPrimary && (
            <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={onHide}>
              {t("Hide in view")}
            </Menu.Item>
          )}
          {editable && onMove && !prop.isPrimary && (
            <>
              <Menu.Item leftSection={<IconArrowLeft size={14} />} onClick={() => onMove(-1)}>
                {t("Move left")}
              </Menu.Item>
              <Menu.Item leftSection={<IconArrowRight size={14} />} onClick={() => onMove(1)}>
                {t("Move right")}
              </Menu.Item>
            </>
          )}
          {editable && !prop.isPrimary && (
            <>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={remove}>
                {t("Delete property")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      <OptionsModal
        opened={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        prop={prop}
        actions={actions}
      />
    </>
  );
}

function OptionsModal({
  opened,
  onClose,
  prop,
  actions,
}: {
  opened: boolean;
  onClose: () => void;
  prop: IBaseProperty;
  actions: BaseActions;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ISelectOption[]>([]);
  useEffect(() => {
    if (opened) setOptions(optionsOf(prop));
  }, [opened, prop]);

  const set = (id: string, patch: Partial<ISelectOption>) =>
    setOptions((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const save = async () => {
    const clean = options
      .map((o) => ({ ...o, name: o.name.trim() }))
      .filter((o) => o.name);
    await actions.updateProperty(prop.id, { typeOptions: { options: clean } });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Options for {{name}}", { name: prop.name })} centered>
      <Stack gap="xs">
        {options.map((o, i) => (
          <Group key={o.id} gap={6} wrap="nowrap">
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" aria-label={t("Color")}>
                  <ColorSwatch color={`var(--mantine-color-${o.color}-5)`} size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Group gap={4} p={4} w={170}>
                  {OPTION_COLORS.map((c) => (
                    <ActionIcon key={c} variant="subtle" onClick={() => set(o.id, { color: c })} aria-label={c}>
                      <ColorSwatch color={`var(--mantine-color-${c}-5)`} size={18} />
                    </ActionIcon>
                  ))}
                </Group>
              </Menu.Dropdown>
            </Menu>
            <TextInput
              size="xs"
              style={{ flex: 1 }}
              value={o.name}
              autoFocus={i === options.length - 1 && !o.name}
              onChange={(e) => set(o.id, { name: e.currentTarget.value })}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => setOptions((list) => list.filter((x) => x.id !== o.id))}
              aria-label={t("Delete")}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="subtle"
          size="xs"
          onClick={() =>
            setOptions((list) => [...list, { id: newOptionId(), name: "", color: nextOptionColor(list) }])
          }
        >
          {t("Add option")}
        </Button>
        <Text size="xs" c="dimmed">
          {t("Deleting an option clears it in all rows.")}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={save}>{t("Save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
