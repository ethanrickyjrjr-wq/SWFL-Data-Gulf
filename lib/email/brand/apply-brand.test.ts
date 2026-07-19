import { describe, test, expect } from "bun:test";
import { applyBrand } from "./apply-brand";
import type { EmailDoc } from "@/lib/email/doc/types";

function docWithHeroLabel(label: string): EmailDoc {
  return {
    globalStyle: {
      primaryColor: "#111",
      accentColor: "#3DC9C0",
      textColor: "#222",
      backdropColor: "#fff",
      fontFamily: "sans",
    },
    blocks: [
      {
        id: "h1",
        type: "hero",
        props: { value: "$379,500", label, order: "label-first", align: "center" },
      },
    ],
  } as unknown as EmailDoc;
}

const heroLabel = (doc: EmailDoc) => (doc.blocks[0].props as { label?: string }).label;

describe("applyBrand — HERO_LABEL scope dressing never clobbers authored content", () => {
  test("an AUTHORED label (the listing address) survives the overlay", () => {
    const out = applyBrand(docWithHeroLabel("2006 SW 15th Ave, Cape Coral, FL, 33991"), {
      HERO_LABEL: "Cape Coral",
    });
    expect(heroLabel(out)).toBe("2006 SW 15th Ave, Cape Coral, FL, 33991");
  });

  test("a BLANK label is filled by the scope token", () => {
    const out = applyBrand(docWithHeroLabel(""), { HERO_LABEL: "Cape Coral" });
    expect(heroLabel(out)).toBe("Cape Coral");
  });

  test("the house default label is swapped for the project's place", () => {
    const out = applyBrand(docWithHeroLabel("Southwest Florida"), { HERO_LABEL: "Cape Coral" });
    expect(heroLabel(out)).toBe("Cape Coral");
  });

  test("no token → label untouched", () => {
    const out = applyBrand(docWithHeroLabel("Southwest Florida"), { COMPANY_NAME: "X" });
    expect(heroLabel(out)).toBe("Southwest Florida");
  });
});
