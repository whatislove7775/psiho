"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BubbleMenu, EditorContent, FloatingMenu, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Plus,
  Quote,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { articleImageApi } from "@/lib/api/articles";
import c from "../content.module.css";
import { Callout, cleanPastedHtml, ExitWrappers, Figure, TrailingParagraph } from "./nodes";
import e from "./editor.module.css";

/** HTML to store: no trailing empty lines (the editor always keeps one to type on). */
function outHtml(ed: Editor): string {
  if (ed.isEmpty) return "";
  return ed.getHTML().replace(/(?:<p><\/p>)+$/, "");
}

export function words(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

type Block = { key: string; label: string; hint?: string; icon: ReactNode; run: (ed: Editor) => void };

function blocks(pickImage: () => void): Block[] {
  return [
    { key: "h2", label: "Подзаголовок", hint: "##", icon: <Heading2 size={18} />, run: (ed) => ed.chain().focus().setNode("heading", { level: 2 }).run() },
    { key: "h3", label: "Подзаголовок поменьше", hint: "###", icon: <Heading3 size={18} />, run: (ed) => ed.chain().focus().setNode("heading", { level: 3 }).run() },
    { key: "ul", label: "Список", hint: "-", icon: <List size={18} />, run: (ed) => ed.chain().focus().toggleBulletList().run() },
    { key: "ol", label: "Нумерованный список", hint: "1.", icon: <ListOrdered size={18} />, run: (ed) => ed.chain().focus().toggleOrderedList().run() },
    { key: "quote", label: "Цитата", hint: ">", icon: <Quote size={18} />, run: (ed) => ed.chain().focus().toggleBlockquote().run() },
    { key: "callout", label: "Врезка", icon: <Lightbulb size={18} />, run: (ed) => ed.chain().focus().toggleCallout().run() },
    { key: "hr", label: "Разделитель", hint: "---", icon: <Minus size={18} />, run: (ed) => ed.chain().focus().setHorizontalRule().run() },
    { key: "image", label: "Картинка", icon: <ImagePlus size={18} />, run: () => pickImage() },
  ];
}

function emptyLine(state: EditorState): boolean {
  const { $anchor, empty } = state.selection;
  return empty && $anchor.depth === 1 && $anchor.parent.type.name === "paragraph" && $anchor.parent.content.size === 0;
}

function normalizeHref(v: string): string {
  const t = v.trim();
  if (!t) return "";
  if (/^(https?:\/\/|\/|mailto:|tel:|#)/i.test(t)) return t;
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) return `mailto:${t}`;
  return `https://${t}`;
}

/**
 * Visual article editor (TipTap/ProseMirror): what you see is what gets published.
 * - selection → floating toolbar (bold, italic, link, H2/H3, quote, lists); ⌘/Ctrl+K — link;
 * - empty line → «+» block menu (also «/»): headings, lists, quote, callout, divider, picture;
 * - Markdown shortcuts: «## », «- », «1. », «> », **bold**, *italic*, «---»;
 * - paste from Docs/Word/Notion/web keeps structure and drops foreign styles;
 * - pictures: menu, drag & drop, paste from clipboard → uploaded as WebP.
 */
export function RichEditor({
  value,
  onChange,
  onWords,
  onError,
  editable = true,
  label = "Текст статьи",
}: {
  value: string;
  onChange: (html: string) => void;
  onWords?: (n: number) => void;
  onError?: (message: string) => void;
  editable?: boolean;
  label?: string;
}) {
  const [menu, setMenu] = useState<{ open: boolean; i: number; from: "plus" | "bar" }>({ open: false, i: 0, from: "plus" });
  const [linkMode, setLinkMode] = useState(false);
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastHtml = useRef(value);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const cb = useRef({ onChange, onWords, onError });
  cb.current = { onChange, onWords, onError };

  const upload = async (files: File[], pos?: number) => {
    const ok = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!ok.length) {
      if (files.length) cb.current.onError?.("Подойдёт JPG, PNG или WebP.");
      return;
    }
    setUploading((n) => n + ok.length);
    for (const f of ok) {
      try {
        const img = await articleImageApi.upload(f);
        const ed = edRef.current;
        if (ed && !ed.isDestroyed) ed.chain().focus().insertFigure({ src: img.url }, pos).run();
        pos = undefined;
      } catch (err) {
        cb.current.onError?.(err instanceof ApiError ? err.message : "Не получилось загрузить картинку.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  const pickImage = () => fileRef.current?.click();
  const items = blocks(pickImage);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false }),
      LinkExt.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ["mailto", "tel"],
        HTMLAttributes: { target: null, rel: null, class: null },
      }),
      Placeholder.configure({
        placeholder: ({ node, editor: ed }) =>
          node.type.name === "heading"
            ? "Подзаголовок"
            : ed.isEmpty
              ? "Начните писать. Выделите текст, чтобы оформить, или нажмите «+» на пустой строке"
              : "Пишите дальше или нажмите «/»",
      }),
      Figure,
      Callout,
      ExitWrappers,
      TrailingParagraph,
    ],
    content: value || "",
    editorProps: {
      attributes: { class: `${c.prose} ${e.pm}`, "aria-label": label, role: "textbox", "aria-multiline": "true", spellcheck: "true" },
      transformPastedHTML: cleanPastedHtml,
      handlePaste: (_view, event) => {
        const dt = event.clipboardData;
        if (!dt || dt.getData("text/html") || dt.getData("text/plain")) return false;
        const files = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        void uploadRef.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        void uploadRef.current(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      },
      handleKeyDown: (view, event) => {
        const m = menuRef.current;
        const list = itemsRef.current;
        if (m.open) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const d = event.key === "ArrowDown" ? 1 : -1;
            setMenu({ ...m, i: (m.i + d + list.length) % list.length });
            return true;
          }
          if (event.key === "Enter") {
            setMenu({ ...m, open: false });
            if (edRef.current) list[m.i].run(edRef.current);
            return true;
          }
          if (event.key === "Escape") {
            setMenu({ ...m, open: false });
            return true;
          }
          setMenu({ ...m, open: false });
        }
        if (event.key === "/" && emptyLine(view.state)) {
          setMenu({ open: true, i: 0, from: "plus" });
          return true;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          if (!view.state.selection.empty) setLinkMode(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = outHtml(ed);
      lastHtml.current = html;
      cb.current.onChange(html);
      cb.current.onWords?.(words(ed.getText()));
    },
    onCreate: ({ editor: ed }) => cb.current.onWords?.(words(ed.getText())),
    onSelectionUpdate: () => {
      if (menuRef.current.open) setMenu((x) => ({ ...x, open: false }));
    },
  });
  const edRef = useRef<Editor | null>(null);
  edRef.current = editor;

  // Outside changes (restored draft, reset after save) → replace the document
  useEffect(() => {
    if (!editor || value === lastHtml.current) return;
    lastHtml.current = value;
    editor.commands.setContent(value || "", false);
    cb.current.onWords?.(words(editor.getText()));
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const run = (b: Block) => {
    setMenu((x) => ({ ...x, open: false }));
    if (editor) b.run(editor);
  };

  const blockMenu = (
    <div className={e.blockMenu} role="menu" aria-label="Вставить блок">
      {items.map((b, i) => (
        <button
          key={b.key}
          type="button"
          role="menuitem"
          className={e.blockItem}
          data-active={menu.i === i || undefined}
          onMouseDown={(ev) => ev.preventDefault()}
          onMouseEnter={() => setMenu((x) => ({ ...x, i }))}
          onClick={() => run(b)}
        >
          <span className={e.blockIcon}>{b.icon}</span>
          <span>{b.label}</span>
          {b.hint && <kbd>{b.hint}</kbd>}
        </button>
      ))}
    </div>
  );

  const mark = (name: string, label: string, icon: ReactNode, action: () => void, attrs?: Record<string, unknown>) => (
    <button
      type="button"
      className={e.tool}
      aria-label={label}
      title={label}
      aria-pressed={editor?.isActive(name, attrs) ?? false}
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={action}
    >
      {icon}
    </button>
  );

  const tools = editor && (
    <>
      {mark("bold", "Жирный (⌘B)", <Bold size={17} />, () => editor.chain().focus().toggleBold().run())}
      {mark("italic", "Курсив (⌘I)", <Italic size={17} />, () => editor.chain().focus().toggleItalic().run())}
      {mark("link", "Ссылка (⌘K)", <Link2 size={17} />, () => setLinkMode(true))}
      <span className={e.sep} aria-hidden />
      {mark("heading", "Подзаголовок", <Heading2 size={17} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), { level: 2 })}
      {mark("heading", "Подзаголовок поменьше", <Heading3 size={17} />, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), { level: 3 })}
      {mark("blockquote", "Цитата", <Quote size={17} />, () => editor.chain().focus().toggleBlockquote().run())}
      {mark("bulletList", "Список", <List size={17} />, () => editor.chain().focus().toggleBulletList().run())}
      {mark("orderedList", "Нумерованный список", <ListOrdered size={17} />, () => editor.chain().focus().toggleOrderedList().run())}
    </>
  );

  return (
    <div className={e.editorWrap}>
      {editor && editable && (
        <div className={e.mobileBar} role="toolbar" aria-label="Оформление">
          <button
            type="button"
            className={e.tool}
            aria-label="Вставить блок"
            aria-expanded={menu.open && menu.from === "bar"}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => setMenu((x) => ({ open: !(x.open && x.from === "bar"), i: 0, from: "bar" }))}
          >
            <Plus size={18} />
          </button>
          {linkMode ? <LinkInput editor={editor} onDone={() => setLinkMode(false)} /> : tools}
          {menu.open && menu.from === "bar" && <div className={e.barMenu}>{blockMenu}</div>}
        </div>
      )}

      {editor && editable && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120, maxWidth: "none", placement: "top", onHidden: () => setLinkMode(false) }}
          shouldShow={({ editor: ed, state }) =>
            ed.isEditable && !state.selection.empty && !(state.selection instanceof NodeSelection)
          }
        >
          <div className={e.bubble} role="toolbar" aria-label="Оформление выделенного">
            {linkMode ? <LinkInput editor={editor} onDone={() => setLinkMode(false)} /> : tools}
          </div>
        </BubbleMenu>
      )}

      {editor && editable && (
        <FloatingMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: "left-start", offset: [-4, 10], maxWidth: "none" }}
          shouldShow={({ editor: ed, state }) => ed.isEditable && (ed.isFocused || menuRef.current.open) && emptyLine(state)}
        >
          <div className={e.plusWrap}>
            <button
              type="button"
              className={e.plus}
              aria-label="Вставить блок"
              aria-expanded={menu.open && menu.from === "plus"}
              data-open={(menu.open && menu.from === "plus") || undefined}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => setMenu((x) => ({ open: !(x.open && x.from === "plus"), i: 0, from: "plus" }))}
            >
              <Plus size={18} strokeWidth={2} />
            </button>
            {menu.open && menu.from === "plus" && blockMenu}
          </div>
        </FloatingMenu>
      )}

      <EditorContent editor={editor} className={e.content} />
      {!editor && <div className={`${c.prose} ${e.pm} ${e.loading}`} aria-hidden />}

      {uploading > 0 && (
        <p className={e.uploading} role="status">
          <Loader2 size={15} className={e.spin} aria-hidden /> Загружаю картинку…
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        multiple
        onChange={(ev) => {
          const files = Array.from(ev.target.files ?? []);
          ev.target.value = "";
          void upload(files);
        }}
      />
    </div>
  );
}

function LinkInput({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [v, setV] = useState<string>(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const apply = () => {
    const href = normalizeHref(v);
    const chain = editor.chain().focus().extendMarkRange("link");
    (href ? chain.setLink({ href }) : chain.unsetLink()).run();
    onDone();
  };
  return (
    <form
      className={e.linkForm}
      onSubmit={(ev) => {
        ev.preventDefault();
        apply();
      }}
    >
      <input
        autoFocus
        value={v}
        onChange={(ev) => setV(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            ev.preventDefault();
            editor.commands.focus();
            onDone();
          }
        }}
        placeholder="Вставьте ссылку"
        aria-label="Адрес ссылки"
        inputMode="url"
      />
      <button type="submit">{v.trim() ? "Готово" : "Убрать"}</button>
    </form>
  );
}
