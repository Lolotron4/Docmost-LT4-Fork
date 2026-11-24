// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Vorlage bearbeiten: Titel, Beschreibung, Bereich und Inhalt (wird automatisch gespeichert).
import "@/features/editor/styles/index.css";
import "./template.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  Alert,
  Anchor,
  Button,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconArrowLeft, IconInfoCircle, IconTrash } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { getTemplateExtensions } from "@/features/editor/extensions/extensions";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import { EditorLinkMenu } from "@/features/editor/components/link/link-menu";
import TableMenu from "@/features/editor/components/table/table-menu.tsx";
import { TableHandlesLayer } from "@/features/editor/components/table/handle/table-handles-layer";
import ImageMenu from "@/features/editor/components/image/image-menu.tsx";
import CalloutMenu from "@/features/editor/components/callout/callout-menu.tsx";
import ColumnsMenu from "@/features/editor/components/columns/columns-menu.tsx";
import {
  handleFileDrop,
  handlePaste,
} from "@/features/editor/components/common/editor-paste-handler.tsx";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import {
  invalidateTemplates,
  useTemplatePermissionsQuery,
  useTemplateQuery,
} from "../queries/template-query";
import { deleteTemplate, updateTemplate } from "../services/template-service";
import { TemplateVariableDialog } from "../components/template-variable-dialog";
import { TemplatePlaceholderDialog } from "../components/template-placeholder-dialog";

type SaveState = "saved" | "saving" | "error";

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

export default function TemplateEditorPage() {
  const { templateId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAtomValue(userAtom);
  const { data: template, isLoading, isError } = useTemplateQuery(templateId);
  const { data: perms } = useTemplatePermissionsQuery();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const canEdit = !!template?.canEdit;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [placeholderOpen, setPlaceholderOpen] = useState(false);
  const loadedRef = useRef<string | null>(null);

  const save = useCallback(
    async (patch: Parameters<typeof updateTemplate>[0]) => {
      setSaveState("saving");
      try {
        await updateTemplate(patch);
        setSaveState("saved");
        invalidateTemplates();
      } catch (err) {
        setSaveState("error");
        notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
      }
    },
    [t],
  );

  const saveContent = useDebouncedCallback((content: unknown) => {
    if (templateId) save({ templateId, content });
  }, 800);
  const saveTitle = useDebouncedCallback((value: string) => {
    if (templateId) save({ templateId, title: value });
  }, 600);
  const saveDescription = useDebouncedCallback((value: string) => {
    if (templateId) save({ templateId, description: value });
  }, 600);

  const extensions = useMemo(() => getTemplateExtensions(() => setPlaceholderOpen(true)), []);

  const editor = useEditor(
    {
      extensions,
      editable: false,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      textDirection: "auto",
      editorProps: {
        attributes: { "aria-label": t("Template content") },
        handleDOMEvents: {
          keydown: (_view, event) => {
            // Slash-/Emoji-Menü steuert die Pfeiltasten und Enter selbst
            const keys = ["ArrowUp", "ArrowDown", "Enter"];
            if (
              keys.includes(event.key) &&
              (document.querySelector("#slash-command") ||
                document.querySelector("#emoji-command"))
            ) {
              return true;
            }
            return false;
          },
        },
        handlePaste: (_view, event) =>
          editorRef.current && templateId
            ? handlePaste(editorRef.current, event, { templateId }, user?.id)
            : false,
        handleDrop: (_view, event, _slice, moved) =>
          editorRef.current && templateId
            ? handleFileDrop(editorRef.current, event, moved, { templateId })
            : false,
      },
      onCreate({ editor }) {
        // @ts-ignore
        editor.storage.templateId = templateId;
      },
      onUpdate({ editor, transaction }) {
        if (!transaction.docChanged || !editor.isEditable) return;
        setSaveState("saving");
        saveContent(editor.getJSON());
      },
    },
    [templateId],
  );
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Inhalt einmalig laden
  useEffect(() => {
    if (!editor || !template || loadedRef.current === template.id) return;
    loadedRef.current = template.id;
    setTitle(template.title ?? "");
    setDescription(template.description ?? "");
    editor.commands.setContent((template.content as any) ?? "", { emitUpdate: false });
    editor.setEditable(canEdit);
  }, [editor, template, canEdit]);

  // Vor dem Verlassen ausstehende Änderungen speichern
  useEffect(() => () => saveContent.flush?.(), [saveContent]);

  const scopeOptions = useMemo(() => {
    const options: { value: string; label: string; disabled?: boolean }[] = [
      {
        value: "workspace",
        label: t("Whole workspace"),
        disabled: !perms?.canManageWorkspace,
      },
    ];
    for (const s of spaces?.items ?? []) {
      options.push({
        value: s.id,
        label: s.name,
        disabled: !perms?.manageableSpaceIds?.includes(s.id),
      });
    }
    return options;
  }, [spaces, perms, t]);

  const changeScope = async (value: string | null) => {
    if (!templateId || !value) return;
    await save({ templateId, spaceId: value === "workspace" ? null : value });
  };

  const remove = () =>
    modals.openConfirmModal({
      title: t("Delete template"),
      children: <Text size="sm">{t("Are you sure you want to delete this template?")}</Text>,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteTemplate(templateId!);
          invalidateTemplates();
          navigate("/templates");
        } catch (err) {
          notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
        }
      },
    });

  if (isLoading) {
    return (
      <Container size={900} py="xl">
        <Loader />
      </Container>
    );
  }
  if (isError || !template) {
    return (
      <Container size={900} py="xl">
        <Text>{t("Template not found")}</Text>
        <Anchor component={Link} to="/templates">
          {t("Back to templates")}
        </Anchor>
      </Container>
    );
  }

  return (
    <Container size={900} py="lg">
      <DocumentTitle title={template.title || t("Untitled template")} />
      <Group justify="space-between" mb="md">
        <Anchor component={Link} to="/templates" size="sm" c="dimmed">
          <Group gap={4}>
            <IconArrowLeft size={14} />
            {t("Templates")}
          </Group>
        </Anchor>
        <Group gap="sm">
          {canEdit && (
            <Text size="xs" c={saveState === "error" ? "red" : "dimmed"}>
              {saveState === "saving"
                ? t("Saving…")
                : saveState === "error"
                  ? t("Not saved")
                  : t("Saved")}
            </Text>
          )}
          {canEdit && (
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={remove}
            >
              {t("Delete")}
            </Button>
          )}
        </Group>
      </Group>

      {!canEdit && (
        <Alert variant="light" icon={<IconInfoCircle size={18} />} mb="md">
          {t("You can use this template, but not change it.")}
        </Alert>
      )}

      <Stack gap="xs" mb="lg">
        <TextInput
          variant="unstyled"
          size="xl"
          classNames={{ input: "lt4-template-title" }}
          placeholder={t("Untitled template")}
          value={title}
          readOnly={!canEdit}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.currentTarget.value);
            setSaveState("saving");
            saveTitle(e.currentTarget.value);
          }}
        />
        <Textarea
          variant="unstyled"
          autosize
          minRows={1}
          placeholder={t("Short description (optional)")}
          value={description}
          readOnly={!canEdit}
          maxLength={1000}
          onChange={(e) => {
            setDescription(e.currentTarget.value);
            setSaveState("saving");
            saveDescription(e.currentTarget.value);
          }}
        />
        {canEdit && (
          <Group gap="xs" align="center">
            <Text size="sm" c="dimmed">
              {t("Available in")}
            </Text>
            <Select
              size="xs"
              w={240}
              data={scopeOptions}
              value={template.spaceId ?? "workspace"}
              onChange={changeScope}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
          </Group>
        )}
        {canEdit && (
          <Text size="xs" c="dimmed">
            {t("Tip: type / and choose “Variable” for fields that are filled in when the template is used, or “Placeholder text” for grey instructions.")}
          </Text>
        )}
      </Stack>

      <div className="editor-container lt4-template-editor" style={{ position: "relative" }}>
        <EditorContent editor={editor} />
        {editor && canEdit && (
          <div>
            <EditorLinkMenu editor={editor} />
            <EditorBubbleMenu editor={editor} templateMode />
            <TableMenu editor={editor} />
            <TableHandlesLayer editor={editor} />
            <ImageMenu editor={editor} />
            <CalloutMenu editor={editor} />
            <ColumnsMenu editor={editor} />
          </div>
        )}
      </div>

      <TemplateVariableDialog editor={editor} />
      <TemplatePlaceholderDialog
        editor={editor}
        opened={placeholderOpen}
        onClose={() => setPlaceholderOpen(false)}
      />
    </Container>
  );
}
