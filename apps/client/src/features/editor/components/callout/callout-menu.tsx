import { NodeBubbleMenu } from "@/features/editor/components/bubble-menu/node-bubble-menu";
import { findParentNode, posToDOMRect, useEditorState } from "@tiptap/react";
import React, { useCallback } from "react";
import { Node as PMNode } from "@tiptap/pm/model";
import {
  EditorMenuProps,
  ShouldShowProps,
} from "@/features/editor/components/table/types/types.ts";
import { ActionIcon, Button, Popover, Stack, Tooltip } from "@mantine/core";
import { CustomColorSection } from "@/lt4/colors/custom-color-section";
import clsx from "clsx";
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconInfoCircleFilled,
  IconMoodSmile,
  IconNotes,
  IconPalette,
} from "@tabler/icons-react";
import { CalloutType, isEditorReady, isTextSelected } from "@docmost/editor-ext";
import { useTranslation } from "react-i18next";
import EmojiPicker from "@/components/ui/emoji-picker.tsx";
import classes from "../common/toolbar-menu.module.css";

export function CalloutMenu({ editor }: EditorMenuProps) {
  const { t } = useTranslation();

  const shouldShow = useCallback(
    ({ state }: ShouldShowProps) => {
      if (!state) {
        return false;
      }
      if (isTextSelected(editor)) return false;

      return editor.isActive("callout");
    },
    [editor],
  );

  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) {
        return null;
      }

      return {
        isCallout: ctx.editor.isActive("callout"),
        isInfo: ctx.editor.isActive("callout", { type: "info" }),
        isNote: ctx.editor.isActive("callout", { type: "note" }),
        isSuccess: ctx.editor.isActive("callout", { type: "success" }),
        isWarning: ctx.editor.isActive("callout", { type: "warning" }),
        isDanger: ctx.editor.isActive("callout", { type: "danger" }),
        customColor: ctx.editor.getAttributes("callout")?.color || "",
      };
    },
  });

  const getReferencedVirtualElement = useCallback(() => {
    if (!isEditorReady(editor)) return;
    const { selection } = editor.state;
    const predicate = (node: PMNode) => node.type.name === "callout";
    const parent = findParentNode(predicate)(selection);

    if (parent) {
      const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
      const domRect = dom.getBoundingClientRect();
      return {
        getBoundingClientRect: () => domRect,
        getClientRects: () => [domRect],
      };
    }

    const domRect = posToDOMRect(editor.view, selection.from, selection.to);
    return {
      getBoundingClientRect: () => domRect,
      getClientRects: () => [domRect],
    };
  }, [editor]);

  const setCalloutType = useCallback(
    (calloutType: CalloutType) => {
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .updateCalloutType(calloutType)
        .updateCalloutColor(null)
        .run();
    },
    [editor],
  );

  // LT4: eigene Farbe
  const [colorOpen, setColorOpen] = React.useState(false);
  const setCalloutColor = useCallback(
    (color: string | null) => {
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .updateCalloutColor(color)
        .run();
      setColorOpen(false);
    },
    [editor],
  );

  const setCalloutIcon = useCallback(
    (emoji: any) => {
      const emojiChar = emoji?.native || emoji?.emoji || emoji;
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .updateCalloutIcon(emojiChar)
        .run();
    },
    [editor],
  );

  const removeCalloutIcon = useCallback(() => {
    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .updateCalloutIcon("")
      .run();
  }, [editor]);

  const getCurrentIcon = () => {
    const { selection } = editor.state;
    const predicate = (node: PMNode) => node.type.name === "callout";
    const parent = findParentNode(predicate)(selection);
    const icon = parent?.node.attrs.icon;
    return icon || null;
  };

  const currentIcon = getCurrentIcon();

  return (
    <NodeBubbleMenu
      editor={editor}
      pluginKey={`callout-menu`}
      ref={(element) => {
        if (element) element.style.zIndex = "99";
      }}
      updateDelay={0}
      getReferencedVirtualElement={getReferencedVirtualElement}
      options={{
        placement: "bottom",
        // offset: 233, //      //         offset: [0, 10],
        flip: false,
      }}
      shouldShow={shouldShow}
    >
      <div className={classes.toolbar}>
        <Tooltip position="top" label={t("Info")} withinPortal={false}>
          <ActionIcon
            onClick={() => setCalloutType("info")}
            size="lg"
            aria-label={t("Info")}
            variant="subtle"
            className={clsx({ [classes.active]: editorState?.isInfo && !editorState?.customColor })}
          >
            <IconInfoCircleFilled
              size={18}
              color="var(--mantine-color-blue-5)"
            />
          </ActionIcon>
        </Tooltip>

        <Tooltip position="top" label={t("Note")} withinPortal={false}>
          <ActionIcon
            onClick={() => setCalloutType("note")}
            size="lg"
            aria-label={t("Note")}
            variant="subtle"
            className={clsx({ [classes.active]: editorState?.isNote && !editorState?.customColor })}
          >
            <IconNotes size={18} color="var(--mantine-color-grape-5)" />
          </ActionIcon>
        </Tooltip>

        <Tooltip position="top" label={t("Success")} withinPortal={false}>
          <ActionIcon
            onClick={() => setCalloutType("success")}
            size="lg"
            aria-label={t("Success")}
            variant="subtle"
            className={clsx({ [classes.active]: editorState?.isSuccess && !editorState?.customColor })}
          >
            <IconCircleCheckFilled
              size={18}
              color="var(--mantine-color-green-5)"
            />
          </ActionIcon>
        </Tooltip>

        <Tooltip position="top" label={t("Warning")} withinPortal={false}>
          <ActionIcon
            onClick={() => setCalloutType("warning")}
            size="lg"
            aria-label={t("Warning")}
            variant="subtle"
            className={clsx({ [classes.active]: editorState?.isWarning && !editorState?.customColor })}
          >
            <IconAlertTriangleFilled
              size={18}
              color="var(--mantine-color-orange-5)"
            />
          </ActionIcon>
        </Tooltip>

        <Tooltip position="top" label={t("Danger")} withinPortal={false}>
          <ActionIcon
            onClick={() => setCalloutType("danger")}
            size="lg"
            aria-label={t("Danger")}
            variant="subtle"
            className={clsx({ [classes.active]: editorState?.isDanger && !editorState?.customColor })}
          >
            <IconCircleXFilled size={18} color="var(--mantine-color-red-5)" />
          </ActionIcon>
        </Tooltip>

        <Popover
          opened={colorOpen}
          onChange={setColorOpen}
          width={220}
          withinPortal={false}
          position="bottom"
          withArrow
        >
          <Popover.Target>
            <Tooltip position="top" label={t("Custom color")} withinPortal={false}>
              <ActionIcon
                onClick={() => setColorOpen((o) => !o)}
                size="lg"
                aria-label={t("Custom color")}
                variant="subtle"
                className={clsx({ [classes.active]: !!editorState?.customColor })}
              >
                <IconPalette
                  size={18}
                  color={editorState?.customColor || undefined}
                />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <CustomColorSection
                kind="callout"
                currentColor={editorState?.customColor}
                onApply={setCalloutColor}
              />
              {editorState?.customColor && (
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setCalloutColor(null)}
                >
                  {t("Remove color")}
                </Button>
              )}
            </Stack>
          </Popover.Dropdown>
        </Popover>

        <EmojiPicker
          onEmojiSelect={setCalloutIcon}
          removeEmojiAction={removeCalloutIcon}
          readOnly={false}
          icon={currentIcon || <IconMoodSmile size={18} />}
          actionIconProps={{
            size: "lg",
            variant: "subtle",
          }}
        />
      </div>
    </NodeBubbleMenu>
  );
}

export default CalloutMenu;
