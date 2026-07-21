import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { MetadataRoute } from "next";
import { fetchVerifiedCorridorSlugRows, toCorridorLinks } from "./r/cre-swfl/corridors";
import { SOURCE_PROVENANCE_TABLES } from "./r/source/_tables";
import { GUIDES } from "@/lib/guides/registry";

const ORIGIN = "https://www.swfldatagulf.com";
const BRAINS_DIR = path.join(process.cwd(), "brains");

/**
 * Next.js sitemap — enumerates every public report route so crawlers can
 * discover the homepage, /r/[slug], /r/cre-swfl/[corridor], and
 * /r/source/[table] pages.
 *
 * Brain slugs are derived from the actual files in `brains/*.md` (the same
 * source the report page reads — if no .md file exists the page 404s, so we
 * skip it). `test-alpha.md` is a development fixture and is excluded.
 *
 * Corridor slugs come from `fetchVerifiedCorridorSlugRows()` → `toCorridorLinks()`.
 * That is the two-column twin of the drill-down route's `select("*")` read,
 * carrying the IDENTICAL predicate — so it resolves the same corridor SET, and
 * the sitemap still cannot list a URL that 404s. Narrowing columns cannot
 * change which rows return; `corridors.test.ts` pins the link output as equal
 * for slim and fat rows.
 *
 * Source-provenance slugs come from `SOURCE_PROVENANCE_TABLES`, the same
 * allowlist the `/r/source/[table]` page guards against.
 *
 * `lastModified` comes from the file's mtime — cheap and accurate enough for
 * cache-freshness hints to crawlers.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // ── Homepage (/） ─────────────────────────────────────────────────────────
  entries.push({
    url: ORIGIN,
    changeFrequency: "daily",
    priority: 1.0,
  });

  // ── Insiders Edition (/insiders — the campaign centerpiece) ──────────────
  entries.push({
    url: `${ORIGIN}/insiders`,
    changeFrequency: "weekly",
    priority: 0.9,
  });

  // ── Data Desk (/desk — the daily live terminal, highest recency signal) ───
  entries.push({
    url: `${ORIGIN}/desk`,
    changeFrequency: "daily",
    priority: 0.9,
  });

  // ── Report entry points (/r hub + the seller-facing marquee reads) ────────
  // These were invisible to crawlers until 07/19 — only /r/[slug] brain pages
  // were enumerated, so the seller-side landing surfaces had zero SEO path in.
  entries.push({
    url: `${ORIGIN}/r`,
    changeFrequency: "weekly",
    priority: 0.8,
  });
  entries.push({
    url: `${ORIGIN}/r/should-i-sell`,
    changeFrequency: "daily",
    priority: 0.9,
  });
  entries.push({
    url: `${ORIGIN}/r/offer-check`,
    changeFrequency: "daily",
    priority: 0.9,
  });
  entries.push({
    url: `${ORIGIN}/r/back-on-market`,
    changeFrequency: "daily",
    priority: 0.8,
  });

  // ── Guides hub (/guides + /guides/[slug]) ─────────────────────────────────
  entries.push({
    url: `${ORIGIN}/guides`,
    changeFrequency: "weekly",
    priority: 0.7,
  });
  for (const guide of GUIDES) {
    entries.push({
      url: `${ORIGIN}/guides/${guide.slug}`,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  // ── Brain report pages (/r/[slug]) ───────────────────────────────────────
  let files: string[] = [];
  try {
    files = await readdir(BRAINS_DIR);
  } catch {
    // brains dir unavailable at build time — return empty sitemap rather than
    // crashing; the nightly rebuild will regenerate once files are present.
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const slug = file.slice(0, -3);
    // Skip the dev fixture — it is never a real public page.
    if (slug === "test-alpha") continue;

    let lastModified: Date | undefined;
    try {
      const s = await stat(path.join(BRAINS_DIR, file));
      lastModified = s.mtime;
    } catch {
      // stat failed — omit lastModified rather than crashing
    }

    entries.push({
      url: `${ORIGIN}/r/${slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: slug === "master" ? 1.0 : 0.8,
    });
  }

  // ── Corridor drill-down pages (/r/cre-swfl/[corridor]) ───────────────────
  try {
    // Slug-only read: this loop emits URLs, never corridor prose. Same
    // predicate as the fat fetch, so the slug set is identical.
    const corridorRows = await fetchVerifiedCorridorSlugRows();
    const corridorLinks = toCorridorLinks(corridorRows);
    for (const link of corridorLinks) {
      entries.push({
        url: `${ORIGIN}/r/cre-swfl/${link.slug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch {
    // DB unavailable at build time — omit corridor entries rather than crashing
  }

  // ── Source-provenance pages (/r/source/[table]) ───────────────────────────
  for (const table of Object.keys(SOURCE_PROVENANCE_TABLES)) {
    entries.push({
      url: `${ORIGIN}/r/source/${table}`,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  return entries;
}
