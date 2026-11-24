// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button, Group, Modal, SegmentedControl, Stack, TagsInput, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { v7 as uuid7 } from "uuid";
import { getTemplateVariables, templateVariableNameKey } from "@docmost/editor-ext";
import {
  TEMPLATE_VARIABLE_EVENT,
  TemplateVariableEventDetail,
} from "./template-variable-node";

type FieldType = "text" | "multiline" | "select";

export function TemplateVariableDialog({ editor }: { editor: Editor | null }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<TemplateVariableEventDetail | null>(null);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<TemplateVariableEventDetail>).detail;
      setDetail(d);
      setError("");
      if (d.mode === "edit") {
        setName(d.attrs.name ?? "");
        setFieldType((d.attrs.fieldType as FieldType) ?? "text");
        setOptions(d.attrs.options ?? []);
      } else {
        setName("");
        setFieldType("text");
        setOptions([]);
      }
    };
    window.addEventListener(TEMPLATE_VARIABLE_EVENT, handler);
    return () => window.removeEventListener(TEMPLATE_VARIABLE_EVENT, handler);
  }, []);

  const close = () => {
    setDetail(null);
    editor?.commands.focus();
  };

  const existing = (() => {
    try {
      return editor ? getTemplateVariables(editor.getJSON()) : [];
    } catch {
      return [];
    }
  })();

  const save = () => {
    if (!editor) return;
    const cleanName = name.trim().replace(/[\r\n]+/g, " ");
    if (!cleanName) return setError(t("Please enter a name."));
    const cleanOptions = [...new Set(options.map((o) => o.trim()).filter(Boolean))];
    if (fieldType === "select" && cleanOptions.length === 0) {
      return setError(t("Add at least one option."));
    }
    const attrs = {
      name: cleanName,
      fieldType,
      options: fieldType === "select" ? cleanOptions : [],
    };

    if (detail?.mode === "edit") {
      const id = detail.attrs.id;
      // Alle Vorkommen derselben Variable mitändern
      const { tr } = editor.state;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "templateVariable" && node.attrs.id === id) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
        }
      });
      editor.view.dispatch(tr);
    } else {
      // Gleicher Name wie eine vorhandene Variable: deren Definition übernehmen
      const same = existing.find(
        (v) => templateVariableNameKey(v.name) === templateVariableNameKey(cleanName),
      );
      editor
        .chain()
        .focus()
        .insertContent({
          type: "templateVariable",
          attrs: same ? { ...same } : { id: uuid7(), ...attrs },
        })
        .run();
    }
    close();
  };

  const remove = () => {
    if (!editor || detail?.mode !== "edit") return;
    const node = editor.state.doc.nodeAt(detail.pos);
    if (node?.type.name === "templateVariable") {
      editor.chain().focus().deleteRange({ from: detail.pos, to: detail.pos + node.nodeSize }).run();
    }
    close();
  };

  return (
    <Modal
      opened={!!detail}
      onClose={close}
      title={detail?.mode === "edit" ? t("Edit variable") : t("Insert variable")}
      size="md"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t("Whoever uses the template is asked for this value. It then replaces the variable everywhere in the page.")}
        </Text>
        <TextInput
          label={t("Name")}
          placeholder={t("e.g. Date, Group, Topic")}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
          maxLength={60}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("Field type")}
          </Text>
          <SegmentedControl
            fullWidth
            value={fieldType}
            onChange={(v) => setFieldType(v as FieldType)}
            data={[
              { value: "text", label: t("Short text") },
              { value: "multiline", label: t("Long text") },
              { value: "select", label: t("Selection") },
            ]}
          />
        </div>
        {fieldType === "select" && (
          <TagsInput
            label={t("Options")}
            description={t("Press Enter after each option.")}
            value={options}
            onChange={setOptions}
            maxTags={30}
          />
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="space-between">
          {detail?.mode === "edit" ? (
            <Button variant="subtle" color="red" onClick={remove}>
              {t("Remove")}
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant="default" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button onClick={save}>{detail?.mode === "edit" ? t("Save") : t("Insert")}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
