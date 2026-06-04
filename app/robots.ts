import type { MetadataRoute } from "next";

const ORIGIN = "https://www.swfldatagulf.com";

/**
 * Next.js robots.txt — allows all crawlers and points them at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
