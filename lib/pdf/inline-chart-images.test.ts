import { test, expect } from "bun:test";
import { inlineChartImages, isHostedChartUrl } from "./inline-chart-images";
import type { EmailDoc } from "@/lib/email/doc/types";

// PDF charts must embed the PNG as a self-contained data-URI, NOT a remote Supabase URL
// (prochart-rendering anti-pattern: "PDF <Image> = data-URI, not a Supabase URL"). @react-pdf
// fetching a remote chart at render time is the flaky path that left PDFs chart-less. Email
// keeps the hosted URL (Gmail strips data-URIs); only the PDF render path inlines — so this
// transform runs ONLY in lib/pdf, over our OWN hosted chart PNGs (the /email-charts/ key).

const CHART_URL =
  "https://proj.supabase.co/storage/v1/object/public/email-media/email-charts/bar-table-33904-2026-05-31-3dc9c0.png";
const PHOTO_URL = "https://proj.supabase.co/storage/v1/object/public/avatars/agent.jpg";

function docWith(url: string, type: "image" = "image"): EmailDoc {
  return {
    globalStyle: {
      primaryColor: "#0F1D24",
      accentColor: "#3DC9C0",
      fontFamily: "MODERN_SANS",
      textColor: "#242424",
      backdropColor: "#F8F8F8",
    },
    blocks: [{ id: "b1", type, props: { url, alt: "chart", caption: "as of 05/31/2026" } }],
  };
}

test("isHostedChartUrl matches our chart PNGs, not arbitrary images", () => {
  expect(isHostedChartUrl(CHART_URL)).toBe(true);
  expect(isHostedChartUrl(PHOTO_URL)).toBe(false);
  expect(isHostedChartUrl(undefined)).toBe(false);
  expect(isHostedChartUrl("")).toBe(false);
});

test("a hosted chart image is inlined to a base64 data-URI, caption/alt preserved", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]); // fake PNG bytes
  const out = await inlineChartImages(docWith(CHART_URL), {
    fetchPng: async () => png,
  });
  const block = out.blocks[0];
  expect(block.type).toBe("image");
  const props = block.props as { url?: string; alt?: string; caption?: string };
  expect(props.url).toBe(`data:image/png;base64,${png.toString("base64")}`);
  expect(props.alt).toBe("chart");
  expect(props.caption).toBe("as of 05/31/2026");
});

test("a non-chart image (agent photo) is left as a remote URL", async () => {
  const out = await inlineChartImages(docWith(PHOTO_URL), {
    fetchPng: async () => {
      throw new Error("must not fetch non-chart images");
    },
  });
  expect((out.blocks[0].props as { url?: string }).url).toBe(PHOTO_URL);
});

test("a failed fetch leaves the chart URL intact (best-effort, never throws)", async () => {
  const out = await inlineChartImages(docWith(CHART_URL), {
    fetchPng: async () => null,
  });
  expect((out.blocks[0].props as { url?: string }).url).toBe(CHART_URL);
});

test("returns a NEW doc — never mutates the input", async () => {
  const input = docWith(CHART_URL);
  const out = await inlineChartImages(input, { fetchPng: async () => Buffer.from([1]) });
  expect(out).not.toBe(input);
  expect((input.blocks[0].props as { url?: string }).url).toBe(CHART_URL); // input untouched
});
