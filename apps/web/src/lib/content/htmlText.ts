/** Article HTML (sanitized, see apps/content/richtext.py) → plain Markdown for llms-full.txt. */
import { decodeEntities } from "@/components/content/RichText";

export function htmlToMarkdown(html: string): string {
  return decodeEntities(
    (html ?? "")
      .replace(/<figure[^>]*>([\s\S]*?)<\/figure>/g, (_m, inner: string) => {
        const cap = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(inner)?.[1]?.replace(/<[^>]+>/g, "").trim();
        return cap ? `\n\n_Иллюстрация: ${cap}_\n\n` : "\n\n";
      })
      .replace(/<h2>/g, "\n\n### ")
      .replace(/<h3>/g, "\n\n#### ")
      .replace(/<\/h[23]>/g, "\n\n")
      .replace(/<li>/g, "\n- ")
      .replace(/<(blockquote|aside)>/g, "\n\n> ")
      .replace(/<hr>/g, "\n\n---\n\n")
      .replace(/<br>/g, "\n")
      .replace(/<\/?strong>/g, "**")
      .replace(/<\/?em>/g, "*")
      .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, "[$2]($1)")
      .replace(/<\/p>/g, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
