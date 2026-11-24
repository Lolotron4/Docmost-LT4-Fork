// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Hinweistext ("Hier das Thema eintragen …"), der verschwindet, sobald jemand tippt.
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

type Props = { editor: Editor | null; opened: boolean; onClose: () => void };

export function TemplatePlaceholderDialog({ editor, opened, onClose }: Props) {
  const { t } = useTranslation();
  const [hint, setHint] = useState("");
  const [editPos, setEditPos] = useState<number | null>(null);

  useEffect(() => {
    if (!opened || !editor) return;
    const sel = editor.state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === "templatePlaceholder") {
      setHint(sel.node.attrs.hint ?? "");
      setEditPos(sel.from);
    } else {
      setHint("");
      setEditPos(null);
    }
  }, [opened, editor]);

  const save = () => {
    if (!editor) return;
    const text = hint.trim().replace(/[\r\n]+/g, " ");
    if (!text) return;
    if (editPos !== null) {
      const node = editor.state.doc.nodeAt(editPos);
      if (node) {
        editor.view.dispatch(editor.state.tr.setNodeMarkup(editPos, undefined, { ...node.attrs, hint: text }));
      }
      editor.commands.focus();
    } else {
      editor.chain().focus().insertContent({ type: "templatePlaceholder", attrs: { hint: text } }).run();
    }
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Placeholder text")} size="md">
      <Stack>
        <Text size="sm" c="dimmed">
          {t("Shown as a grey instruction on the new page until someone types there.")}
        </Text>
        <TextInput
          data-autofocus
          placeholder={t("e.g. Describe your results here")}
          value={hint}
          maxLength={200}
          onChange={(e) => setHint(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={!hint.trim()}>
            {editPos !== null ? t("Save") : t("Insert")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
