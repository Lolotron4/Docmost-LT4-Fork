// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useRef, useState } from "react";
import { Anchor, Checkbox, Group, Popover, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CellValue, IBaseProperty } from "../../types/base.types";
import { dateOf, formatDate, optionsOf } from "../../base.utils";
import { BaseActions } from "../../queries/base-query";
import { OptionBadge } from "./option-badge";
import { SelectPicker } from "./select-picker";
import { BaseDatePicker } from "./date-picker";
import classes from "../base.module.css";

interface Props {
  prop: IBaseProperty;
  value: CellValue;
  editable: boolean;
  actions: BaseActions;
  onChange: (value: CellValue | null) => void;
  /** "table": kompakte Zelle; "field": Feld im Zeilen-Dialog */
  variant?: "table" | "field";
  placeholder?: string;
}

function safeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function BaseCell({
  prop,
  value,
  editable,
  actions,
  onChange,
  variant = "table",
  placeholder,
}: Props) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState(false);
  const cls = variant === "table" ? classes.cell : classes.field;

  if (prop.type === "checkbox") {
    return (
      <div className={cls} data-type="checkbox">
        <Checkbox
          size="xs"
          checked={value === true}
          disabled={!editable}
          onChange={(e) => onChange(e.currentTarget.checked ? true : null)}
          aria-label={prop.name}
        />
      </div>
    );
  }

  if (prop.type === "select" || prop.type === "multiSelect" || prop.type === "date") {
    const options = optionsOf(prop);
    const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const display =
      prop.type === "date" ? (
        <Text size="sm" truncate>
          {formatDate(dateOf(value), i18n.language)}
        </Text>
      ) : (
        <Group gap={4} wrap={variant === "table" ? "nowrap" : "wrap"} style={{ overflow: "hidden" }}>
          {ids
            .map((id) => options.find((o) => o.id === id))
            .filter(Boolean)
            .map((o) => (
              <OptionBadge key={o!.id} option={o!} />
            ))}
        </Group>
      );
    const empty = prop.type === "date" ? !dateOf(value) : ids.length === 0;

    if (!editable) return <div className={cls}>{display}</div>;
    return (
      <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" withinPortal trapFocus>
        <Popover.Target>
          <UnstyledButton className={cls} onClick={() => setOpened((o) => !o)} data-empty={empty || undefined}>
            {empty && variant === "field" ? (
              <Text size="sm" c="dimmed">
                {placeholder ?? t("Empty")}
              </Text>
            ) : (
              display
            )}
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown p="xs" onKeyDownCapture={(e) => e.key === "Escape" && setOpened(false)}>
          {prop.type === "date" ? (
            <BaseDatePicker
              value={dateOf(value)}
              onChange={(v) => {
                onChange(v ? { start: v } : null);
                setOpened(false);
              }}
            />
          ) : (
            <SelectPicker
              prop={prop}
              value={ids}
              multiple={prop.type === "multiSelect"}
              actions={actions}
              onChange={(next) => {
                if (prop.type === "select") {
                  onChange(next[0] ?? null);
                  setOpened(false);
                } else onChange(next.length ? next : null);
              }}
            />
          )}
        </Popover.Dropdown>
      </Popover>
    );
  }

  // text, number, url
  const text = value === undefined || value === null ? "" : String(value);
  if (editing && editable) {
    return (
      <InlineInput
        className={cls}
        initial={text}
        numeric={prop.type === "number"}
        onDone={(next) => {
          setEditing(false);
          if (next === text) return;
          if (prop.type === "number") {
            const n = Number(next.replace(",", "."));
            onChange(next.trim() === "" || !Number.isFinite(n) ? null : n);
          } else onChange(next.trim() === "" ? null : next);
        }}
      />
    );
  }
  return (
    <div
      className={cls}
      data-type={prop.type}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={() => editable && setEditing(true)}
      onKeyDown={(e) => {
        if (editable && (e.key === "Enter" || e.key === "F2")) {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {text ? (
        prop.type === "url" ? (
          <Anchor
            size="sm"
            href={safeUrl(text)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            truncate
          >
            {text}
          </Anchor>
        ) : (
          <Text size="sm" truncate={variant === "table"} ta={prop.type === "number" ? "right" : undefined} w="100%" style={{ whiteSpace: variant === "field" ? "pre-wrap" : undefined }}>
            {prop.type === "number" ? Number(text).toLocaleString(i18n.language) : text}
          </Text>
        )
      ) : variant === "field" || placeholder ? (
        <Text size="sm" c="dimmed">
          {placeholder ?? t("Empty")}
        </Text>
      ) : null}
    </div>
  );
}

function InlineInput({
  initial,
  numeric,
  onDone,
  className,
}: {
  initial: string;
  numeric: boolean;
  onDone: (value: string) => void;
  className: string;
}) {
  const [draft, setDraft] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (value: string) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <div className={className} data-editing>
      <TextInput
        ref={ref}
        variant="unstyled"
        size="sm"
        w="100%"
        inputMode={numeric ? "decimal" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => finish(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(initial);
          }
        }}
      />
    </div>
  );
}
