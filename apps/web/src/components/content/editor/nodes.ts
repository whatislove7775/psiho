/**
 * Article-specific TipTap nodes. The HTML they produce is exactly what the server allowlist keeps
 * (apps/content/richtext.py) and components/content/RichText renders:
 *   <figure data-width="column|wide"><img src="/media/content/…webp" alt><figcaption>…</figcaption></figure>
 *   <aside><p>…</p></aside>   — «врезка» (callout)
 */
import { Extension, Node, mergeAttributes } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { FigureView } from "./FigureView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    figure: { insertFigure: (attrs: { src: string; alt?: string; width?: "column" | "wide" }, pos?: number) => ReturnType };
    callout: { toggleCallout: () => ReturnType };
  }
}

/** Only our own uploads: external pictures from pasted pages are dropped (no hotlinking). */
export const OWN_IMAGE = /^(?:https?:\/\/[a-z0-9.:-]+)?\/media\/content\/[0-9a-f]{32}(?:-md)?\.webp$/i;

export const Figure = Node.create({
  name: "figure",
  group: "block",
  content: "inline*",
  marks: "",
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      width: { default: "column" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        contentElement: "figcaption",
        getAttrs: (el) => {
          const img = (el as HTMLElement).querySelector("img");
          const src = img?.getAttribute("src") ?? "";
          if (!OWN_IMAGE.test(src)) return false;
          return { src, alt: img?.getAttribute("alt") ?? "", width: (el as HTMLElement).dataset.width === "wide" ? "wide" : "column" };
        },
      },
      {
        tag: "img[src]",
        getAttrs: (el) => {
          const src = (el as HTMLElement).getAttribute("src") ?? "";
          return OWN_IMAGE.test(src) ? { src, alt: (el as HTMLElement).getAttribute("alt") ?? "" } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "figure",
      { "data-width": node.attrs.width === "wide" ? "wide" : "column" },
      ["img", { src: node.attrs.src, alt: node.attrs.alt ?? "" }],
      ["figcaption", 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },

  addCommands() {
    return {
      insertFigure:
        (attrs, pos) =>
        ({ chain, state }) => {
          const node = { type: this.name, attrs: { width: "column", alt: "", ...attrs } };
          if (pos === undefined) {
            // Pictures live between top-level blocks: an empty line is replaced, otherwise it goes after the block
            const { $from } = state.selection;
            if ($from.depth === 1 && $from.parent.type.name === "paragraph" && !$from.parent.content.size)
              return chain().insertContent(node).run();
            pos = $from.depth >= 1 ? $from.after(1) : state.doc.content.size;
          } else {
            const $p = state.doc.resolve(Math.min(pos, state.doc.content.size));
            if ($p.depth >= 1) pos = $p.after(1);
          }
          return chain().insertContentAt(pos, node).run();
        },
    };
  },
});

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,

  parseHTML() {
    return [{ tag: "aside" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});

/** Enter on an empty last line of a quote / callout steps out of it (like lists do). */
export const ExitWrappers = Extension.create({
  name: "exitWrappers",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== "paragraph" || $from.parent.content.size) return false;
        if ($from.depth < 2) return false;
        const wrap = $from.node($from.depth - 1);
        if (!["blockquote", "callout"].includes(wrap.type.name)) return false;
        if ($from.index($from.depth - 1) !== wrap.childCount - 1) return false;
        return editor.commands.lift("paragraph");
      },
    };
  },
});

/**
 * Pasted HTML: Word/Docs/Notion/web pages. ProseMirror keeps only what the schema knows (so fonts,
 * colours and classes vanish on their own); here we fix what it would otherwise lose:
 * h1 → h2, h4–h6 → h3, Word's fake lists (<p class=MsoListParagraph>) → real lists.
 */
export function cleanPastedHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rename = (from: string, to: string) =>
    doc.querySelectorAll(from).forEach((el) => {
      const n = doc.createElement(to);
      n.innerHTML = el.innerHTML;
      el.replaceWith(n);
    });
  rename("h1", "h2");
  rename("h4, h5, h6", "h3");
  // Word: bullets are separate paragraphs with a hidden «·» span (mso-list:Ignore)
  const items = Array.from(doc.querySelectorAll<HTMLElement>("p[class^='MsoListParagraph'], p[style*='mso-list']"));
  let list: HTMLElement | null = null;
  for (const p of items) {
    p.querySelectorAll("span[style*='mso-list:Ignore'], span[style*='mso-list: Ignore']").forEach((s) => s.remove());
    const ordered = /^\s*\d+[.)]/.test(p.textContent ?? "");
    // Consecutive list paragraphs join the list created for the previous one
    if (!list || p.previousElementSibling !== list) {
      list = doc.createElement(ordered ? "ol" : "ul");
      p.before(list);
    }
    const li = doc.createElement("li");
    li.innerHTML = p.innerHTML.replace(/^\s*(?:\d+[.)]|[·•§o])(?:\s|&nbsp;|\u00a0)+/, "");
    list.appendChild(li);
    p.remove();
  }
  return doc.body.innerHTML;
}

/** Keeps an empty paragraph at the end, so there's always a line to type on after a picture or a list. */
export const TrailingParagraph = Extension.create({
  name: "trailingParagraph",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("trailingParagraph"),
        appendTransaction: (_trs, _old, state) => {
          const last = state.doc.lastChild;
          if (last && last.type.name === "paragraph") return null;
          return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
        },
      }),
    ];
  },
});
