"use client";

import { t } from "@/lib/i18n";
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
          <div className={e.figTools} role="toolbar" aria-label={t("Картинка")}>
            <button type="button" aria-pressed={width === "column"} onClick={() => updateAttributes({ width: "column" })}>
              {t("По\u00a0ширине текста")}
            </button>
            <button type="button" aria-pressed={width === "wide"} onClick={() => updateAttributes({ width: "wide" })}>
              {t("Шире")}
            </button>
            <button type="button" aria-label={t("Удалить картинку")} title={t("Удалить картинку")} onClick={() => deleteNode()}>
              <Trash2 size={15} strokeWidth={1.9} />
            </button>
          </div>
        )}
      </div>
      <div className={e.capWrap}>
        {node.content.size === 0 && editable && (
          <span className={e.capHint} contentEditable={false} aria-hidden>
            {t("Подпись (необязательно)")}
          </span>
        )}
        <NodeViewContent as="figcaption" className={e.caption} />
      </div>
    </NodeViewWrapper>
  );
}
