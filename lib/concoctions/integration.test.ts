// lib/concoctions/integration.test.ts — the spec's end-to-end claim: a canvas
// mixing OUR-DATA blocks (lane lake) with a USER-STATED figure (lane user)
// renders through the REAL email renderer with both provenances visible and
// zero placeholders. Bindings ride the doc without disturbing any send path.
import { describe, it, expect } from "bun:test";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { EmailDoc } from "@/lib/email/doc/types";
import { materializeLoad } from "./materialize";
import { materializeUserFigure } from "./user-bundle";
import { placeLoadedBlocks } from "./place-blocks";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";
import { CORRIDOR_ROWS } from "./materialize.test";

const STYLE: EmailDoc["globalStyle"] = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#111111",
  backdropColor: "#f5f5f5",
};

describe("mixed-lane canvas", () => {
  it("lake blocks + a user-stated figure render to email HTML with both provenances and no placeholders", async () => {
    const { blocks } = await materializeLoad(
      corridorProfiles,
      {},
      {
        sb: stubSb(CORRIDOR_ROWS),
        hostPng: async (k) => `https://cdn.example/x/${k}`,
      },
    );
    const userBlock = materializeUserFigure(
      { label: "My building's rent", value: "$21.50", attribution: "operator" },
      { id: "user-1", asOf: "07/12/2026" },
    );
    const all = [...blocks, ...placeLoadedBlocks(blocks, [userBlock])];

    // The doc round-trips the schema (bindings included) before rendering —
    // the same parse every save/send path runs.
    const doc = EmailDocSchema.parse({ globalStyle: STYLE, blocks: all }) as EmailDoc;
    const html = await renderEmailDocHtml(doc);

    // The ampersand is HTML-escaped in the rendered email, so match around it.
    expect(html).toContain("Wakefield MarketBeat — Southwest Florida Retail, Q4 2025");
    expect(html).toContain("$21.50");
    expect(html).toContain("Provided by operator");
    expect(html).toContain("$60.84"); // a lake value, verbatim
    expect(html).not.toMatch(/\{\{|N\/A|undefined/);
    // internal freshness-token shapes never ship
    expect(html).not.toMatch(/SWFL-\d+-\d+-\d{8}/);
  });
});
