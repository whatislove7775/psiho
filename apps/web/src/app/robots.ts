import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Public pages are open to search and AI crawlers; cabinets, calls and the API are not. */
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/api/", "/app", "/pro", "/admin", "/room", "/session/", "/recover", "/dev", "/articles?q="];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
