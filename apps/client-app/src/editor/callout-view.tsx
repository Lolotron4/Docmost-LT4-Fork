// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Menu, UnstyledButton } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconNote,
  IconAlertOctagon,
} from "@tabler/icons-react";

const TYPES = [
  { type: "info", label: "Info", Icon: IconInfoCircle, color: "blue" },
  { type: "success", label: "Erfolg", Icon: IconCircleCheck, color: "green" },
  { type: "warning", label: "Warnung", Icon: IconAlertTriangle, color: "yellow" },
  { type: "danger", label: "Gefahr", Icon: IconAlertOctagon, color: "red" },
  { type: "default", label: "Notiz", Icon: IconNote, color: "gray" },
];

export default function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const t = TYPES.find((x) => x.type === node.attrs.type) ?? TYPES[0];
  const custom: string | null = node.attrs.color;
  const bg = custom
    ? `color-mix(in srgb, ${custom} 14%, transparent)`
    : `var(--mantine-color-${t.color}-light)`;
  const border = custom ?? `var(--mantine-color-${t.color}-filled)`;

  return (
    <NodeViewWrapper
      className="lt4-callout"
      style={{ background: bg, borderLeft: `4px solid ${border}` }}
    >
      <Menu disabled={!editor.isEditable} position="bottom-start" withinPortal>
        <Menu.Target>
          <UnstyledButton contentEditable={false} className="lt4-callout-icon" aria-label="Art der Infobox">
            <t.Icon size={20} color={border} />
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
      <NodeViewContent className="lt4-callout-content" />
    </NodeViewWrapper>
  );
}
