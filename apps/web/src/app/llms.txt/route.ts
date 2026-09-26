import { buildLlmsTxt } from "@/lib/content/llms";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(await buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
