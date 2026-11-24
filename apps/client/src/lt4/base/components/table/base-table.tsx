// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useRef, useState } from "react";
import { ActionIcon, Menu, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconArrowsDiagonal,
  IconDots,
  IconPlus,
  IconRowInsertBottom,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IBase, IBaseProperty, IBaseRow, IBaseView, PROPERTY_TYPES, PropertyType } from "../../types/base.types";
import { BaseActions } from "../../queries/base-query";
import { BaseCell } from "../cells/base-cell";
import { PROPERTY_LABELS, PropertyIcon } from "../cells/property-icon";
import { PropertyMenu } from "../property-menu";
import classes from "../base.module.css";

interface Props {
  base: IBase;
  view: IBaseView;
  properties: IBaseProperty[];
  rows: IBaseRow[];
  editable: boolean;
  actions: BaseActions;
  onOpenRow: (rowId: string) => void;
  onAddRow: () => void;
  canAddRow: boolean;
}

const DEFAULT_WIDTH = 200;
const PRIMARY_WIDTH = 280;

export function BaseTable({ base, view, properties, rows, editable, actions, onOpenRow, onAddRow, canAddRow }: Props) {
  const { t } = useTranslation();
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<string | null>(null);
  const widthsRef = useRef<Record<string, number>>({});

  const widthOf = (p: IBaseProperty) =>
    liveWidths[p.id] ?? view.config.propertyWidths?.[p.id] ?? (p.isPrimary ? PRIMARY_WIDTH : DEFAULT_WIDTH);

  const setConfig = (patch: Partial<IBaseView["config"]>) =>
    actions.updateView(view.id, { config: { ...view.config, ...patch } });

  const startResize = (prop: IBaseProperty, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(prop);
    setResizing(prop.id);
    const move = (ev: PointerEvent) => {
      const w = Math.max(80, Math.min(1000, startW + ev.clientX - startX));
      widthsRef.current = { ...widthsRef.current, [prop.id]: w };
      setLiveWidths((cur) => ({ ...cur, [prop.id]: w }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(null);
      const w = widthsRef.current[prop.id];
      if (w) setConfig({ propertyWidths: { ...(view.config.propertyWidths ?? {}), [prop.id]: w } });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const moveProperty = (prop: IBaseProperty, dir: -1 | 1) => {
    const all = base.properties;
    const idx = all.findIndex((p) => p.id === prop.id);
    const target = idx + dir;
    if (target < 1 || target >= all.length) return;
    const list = all.filter((p) => p.id !== prop.id);
    const after = list[target - 1];
    actions.moveProperty(prop.id, after?.id ?? null);
  };

  const addProperty = async (type: PropertyType) => {
    await actions.addProperty(t(PROPERTY_LABELS[type]), type, type === "select" || type === "multiSelect" ? { options: [] } : undefined);
  };

  return (
    <div className={classes.table} role="table">
      <div className={`${classes.tr} ${classes.headerRow}`} role="row">
        <div className={classes.gutter} />
        {properties.map((prop) => (
          <PropertyMenu
            key={prop.id}
            prop={prop}
            actions={actions}
            editable={editable}
            onSort={(direction) => setConfig({ sorts: [{ propertyId: prop.id, direction }] })}
            onHide={() =>
              setConfig({ hiddenPropertyIds: [...(view.config.hiddenPropertyIds ?? []), prop.id] })
            }
            onMove={(dir) => moveProperty(prop, dir)}
          >
            <div className={classes.th} style={{ width: widthOf(prop) }} role="columnheader">
              <PropertyIcon type={prop.type} />
              <Text size="sm" truncate fw={500}>
                {prop.name}
              </Text>
              {editable && (
                <div
                  className={classes.resizer}
                  data-active={resizing === prop.id || undefined}
                  onPointerDown={(e) => startResize(prop, e)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </PropertyMenu>
        ))}
        {editable && (
          <Menu position="bottom-start" withinPortal>
            <Menu.Target>
              <Tooltip label={t("Add property")} withArrow>
                <UnstyledButton className={classes.th} style={{ width: 44, justifyContent: "center" }} aria-label={t("Add property")}>
                  <IconPlus size={16} />
                </UnstyledButton>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t("Property type")}</Menu.Label>
              {PROPERTY_TYPES.map((type) => (
                <Menu.Item key={type} leftSection={<PropertyIcon type={type} />} onClick={() => addProperty(type)}>
                  {t(PROPERTY_LABELS[type])}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>

      {rows.map((row) => (
        <div key={row.id} className={classes.tr} role="row">
          <div className={classes.gutter}>
            {editable && (
              <Menu position="bottom-start" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="sm" className={classes.rowTools} aria-label={t("Row options")}>
                    <IconDots size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconArrowsDiagonal size={14} />} onClick={() => onOpenRow(row.id)}>
                    {t("Open entry")}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconRowInsertBottom size={14} />}
                    onClick={() => actions.addRow({ afterRowId: row.id })}
                  >
                    {t("Insert row below")}
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => actions.deleteRows([row.id])}>
                    {t("Delete row")}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </div>
          {properties.map((prop) => (
            <div key={prop.id} className={classes.td} style={{ width: widthOf(prop) }} role="cell">
              <BaseCell
                prop={prop}
                value={row.cells[prop.id]}
                editable={editable}
                actions={actions}
                onChange={(value) => actions.updateCells(row.id, { [prop.id]: value })}
              />
              {prop.isPrimary && (
                <Tooltip label={t("Open entry")} withArrow>
                  <ActionIcon
                    size="sm"
                    variant="default"
                    className={classes.openButton}
                    onClick={() => onOpenRow(row.id)}
                    aria-label={t("Open entry")}
                  >
                    <IconArrowsDiagonal size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      ))}

      {editable && canAddRow && (
        <UnstyledButton className={classes.addRow} onClick={onAddRow}>
          <IconPlus size={14} />
          {t("New")}
        </UnstyledButton>
      )}
      {!rows.length && !editable && (
        <Text size="sm" c="dimmed" p="sm">
          {t("No entries")}
        </Text>
      )}
    </div>
  );
}
