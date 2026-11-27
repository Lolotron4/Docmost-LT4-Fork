// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { attachmentUrl } from "./attachment-cache";

export default function ImageView({ node, selected }: NodeViewProps) {
  const { attachmentId, src, alt, width, align } = node.attrs;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (attachmentId) {
      attachmentUrl(attachmentId).then((u) => alive && setUrl(u));
    } else if (src && /^(https?:|data:|blob:)/.test(src)) {
      setUrl(src);
    }
    return () => {
      alive = false;
    };
  }, [attachmentId, src]);

  const justify =
    align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  return (
    <NodeViewWrapper
      className="lt4-image"
      style={{ display: "flex", justifyContent: justify }}
      data-drag-handle
    >
      {url ? (
        <img
          src={url}
          alt={alt ?? ""}
          style={{
            maxWidth: "100%",
            width: width ? (typeof width === "number" ? `${width}px` : width) : undefined,
            outline: selected ? "2px solid var(--mantine-color-blue-5)" : "none",
            borderRadius: 4,
          }}
        />
      ) : (
        <div className="lt4-image-missing">Bild wird geladen …</div>
      )}
    </NodeViewWrapper>
  );
}
