"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";
import e from "./editor.module.css";

/** Picture block in the editor: image, width switch (column / wide), delete, editable caption. */
export function FigureView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const width = node.attrs.width === "wide" ? "wide" : "column";
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper as="figure" className={e.figure} data-width={width} data-selected={selected || undefined}>
      <div className={e.figMedia} contentEditable={false} data-drag-handle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={node.attrs.src} alt={node.attrs.alt ?? ""} draggable={false} />
        {editable && (
          <div className={e.figTools} role="toolbar" aria-label="Картинка">
            <button type="button" aria-pressed={width === "column"} onClick={() => updateAttributes({ width: "column" })}>
              По&nbsp;ширине текста
            </button>
            <button type="button" aria-pressed={width === "wide"} onClick={() => updateAttributes({ width: "wide" })}>
              Шире
            </button>
            <button type="button" aria-label="Удалить картинку" title="Удалить картинку" onClick={() => deleteNode()}>
              <Trash2 size={15} strokeWidth={1.9} />
            </button>
          </div>
        )}
      </div>
      <div className={e.capWrap}>
        {node.content.size === 0 && editable && (
          <span className={e.capHint} contentEditable={false} aria-hidden>
            Подпись (необязательно)
          </span>
        )}
        <NodeViewContent as="figcaption" className={e.caption} />
      </div>
    </NodeViewWrapper>
  );
}
