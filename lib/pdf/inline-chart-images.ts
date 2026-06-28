// lib/pdf/inline-chart-images.ts
//
// PDF-only: turn our HOSTED chart PNGs into self-contained base64 data-URIs before the
// EmailDoc is rendered to PDF. @react-pdf can take a remote <Image src>, but fetching a
// chart over the network at render time is the flaky path that left deliverable PDFs
// chart-less (prochart-rendering anti-pattern: "PDF <Image> = data-URI, not a Supabase URL").
//
// Scope is deliberately narrow — ONLY our own chart PNGs (the `email-charts/` upload key from
// lib/email/build-doc.ts). Agent photos / logos stay remote URLs (out of scope; inlining a
// multi-MB photo would bloat the PDF). EMAIL never calls this: Gmail strips data-URIs, which
// is the whole reason chart-image.ts hosts the PNG in the first place. Best-effort: a fetch
// failure leaves the URL untouched (the chart degrades to a remote load, never an error).
//
// Pure over an injected fetcher: the network is `deps.fetchPng` so the transform is
// unit-tested without I/O. Returns a NEW doc — never mutates the input.

import type { EmailBlock, EmailDoc } from "@/lib/email/doc/types";

/** Is this URL one of OUR hosted chart PNGs? The chart upload key is
 *  `email-charts/<frameId>-...png` (build-doc.ts), so the public URL always carries
 *  `/email-charts/`. Distinct from agent photos / logos in other buckets. */
export function isHostedChartUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.includes("/email-charts/");
}

/** Default fetcher: GET our own public chart PNG and return its bytes, or null on any
 *  failure (best-effort — the PDF must still render). */
async function defaultFetchPng(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Replace every hosted-chart `image` block URL with a base64 PNG data-URI. Non-chart
 *  images and non-image blocks pass through unchanged. */
export async function inlineChartImages(
  doc: EmailDoc,
  deps: { fetchPng?: (url: string) => Promise<Buffer | null> } = {},
): Promise<EmailDoc> {
  const fetchPng = deps.fetchPng ?? defaultFetchPng;

  const blocks = await Promise.all(
    doc.blocks.map(async (b): Promise<EmailBlock> => {
      if (b.type !== "image" || !isHostedChartUrl(b.props.url)) return b;
      const png = await fetchPng(b.props.url as string).catch(() => null);
      if (!png) return b; // best-effort: keep the remote URL on failure
      return {
        ...b,
        props: { ...b.props, url: `data:image/png;base64,${png.toString("base64")}` },
      };
    }),
  );

  return { ...doc, blocks };
}
