// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Infobox im gleichen Aussehen wie in der Web-Version (Mantine Alert, Farben je Art).
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Alert, Menu, UnstyledButton } from "@mantine/core";
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconInfoCircleFilled,
  IconNotes,
} from "@tabler/icons-react";
import classes from "../../../client/src/features/editor/components/callout/callout.module.css";

const TYPES = [
  { type: "info", label: "Info", Icon: IconInfoCircleFilled, color: "blue" },
  { type: "note", label: "Notiz", Icon: IconNotes, color: "grape" },
  { type: "success", label: "Erfolg", Icon: IconCircleCheckFilled, color: "green" },
  { type: "warning", label: "Warnung", Icon: IconAlertTriangleFilled, color: "orange" },
  { type: "danger", label: "Gefahr", Icon: IconCircleXFilled, color: "red" },
  { type: "default", label: "Neutral", Icon: IconInfoCircleFilled, color: "gray" },
];

export default function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const t = TYPES.find((x) => x.type === node.attrs.type) ?? TYPES[0];
  const icon: string | null = node.attrs.icon;
  const color: string = node.attrs.color || t.color;

  const iconEl =
    icon && icon.trim() ? <span style={{ fontSize: 18 }}>{icon}</span> : <t.Icon />;

  return (
    <NodeViewWrapper>
      <Alert
        variant="light"
        title=""
        color={color}
        p="xs"
        classNames={{ root: classes.root, message: classes.message, icon: classes.icon }}
        icon={
          <Menu disabled={!editor.isEditable} position="bottom-start" withinPortal>
            <Menu.Target>
              <UnstyledButton contentEditable={false} className="lt4-callout-icon" aria-label="Art der Infobox">
                {iconEl}
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {TYPES.map((x) => (
                <Menu.Item
                  key={x.type}
                  leftSection={<x.Icon size={16} />}
                  onClick={() => updateAttributes({ type: x.type })}
                >
                  {x.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        }
      >
        <NodeViewContent />
      </Alert>
    </NodeViewWrapper>
  );
}
