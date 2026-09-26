import { ldJson } from "@/lib/seo";

/** Structured data for search and AI engines. Rendered on the server into the HTML. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(data) }} />;
}
