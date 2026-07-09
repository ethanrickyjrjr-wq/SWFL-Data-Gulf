import { describe, expect, test } from "bun:test";
import { deriveEmailDocSubject } from "./emaildoc-subject";
import type { EmailDoc, EmailBlock } from "./doc/types";

const STYLE: EmailDoc["globalStyle"] = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

function doc(blocks: EmailBlock[]): EmailDoc {
  return { globalStyle: STYLE, blocks };
}

describe("deriveEmailDocSubject", () => {
  test("prefers a signal title (the headline-like line)", () => {
    const d = doc([
      { id: "h", type: "header", props: { companyName: "Acme Realty", tagline: "We sell homes" } },
      { id: "hero", type: "hero", props: { value: "$360,000", label: "median price" } },
      { id: "s", type: "signal", props: { title: "Lee County prices cooled 2.1% in May" } },
    ]);
    expect(deriveEmailDocSubject(d)).toBe("Lee County prices cooled 2.1% in May");
  });

  test("falls back to a hero label when no signal title", () => {
    const d = doc([
      { id: "h", type: "header", props: { companyName: "Acme Realty", tagline: "We sell homes" } },
      { id: "hero", type: "hero", props: { value: "$360,000", label: "Lee County median price" } },
    ]);
    expect(deriveEmailDocSubject(d)).toBe("Lee County median price");
  });

  test("falls back to the header tagline, then company name", () => {
    expect(
      deriveEmailDocSubject(
        doc([{ id: "h", type: "header", props: { tagline: "Coastal living" } }]),
      ),
    ).toBe("Coastal living");
    expect(
      deriveEmailDocSubject(
        doc([{ id: "h", type: "header", props: { companyName: "Acme Realty" } }]),
      ),
    ).toBe("Acme Realty — market update");
  });

  test("never returns empty — a textless doc gets the neutral default", () => {
    expect(deriveEmailDocSubject(doc([{ id: "d", type: "divider", props: {} }]))).toBe(
      "Your Southwest Florida market update",
    );
    expect(deriveEmailDocSubject(doc([]))).toBe("Your Southwest Florida market update");
  });

  test("collapses whitespace and clamps long subjects with an ellipsis", () => {
    const long = "x".repeat(200);
    const out = deriveEmailDocSubject(doc([{ id: "s", type: "signal", props: { title: long } }]));
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith("…")).toBe(true);

    const spaced = deriveEmailDocSubject(
      doc([{ id: "s", type: "signal", props: { title: "  too    many   spaces  " } }]),
    );
    expect(spaced).toBe("too many spaces");
  });

  test("ignores blank/whitespace-only block text (does not pick an empty signal title)", () => {
    const d = doc([
      { id: "s", type: "signal", props: { title: "   " } },
      { id: "hero", type: "hero", props: { kicker: "This week in SWFL" } },
    ]);
    expect(deriveEmailDocSubject(d)).toBe("This week in SWFL");
  });

  test("prefers subjectVariants[0] over block-derived text when present", () => {
    const d = {
      globalStyle: STYLE,
      blocks: [{ id: "1", type: "signal", props: { title: "Block-derived headline" } }],
      subjectVariants: ["AI-chosen subject line"],
    } as EmailDoc;
    expect(deriveEmailDocSubject(d)).toBe("AI-chosen subject line");
  });

  test("falls back to block-derived text when subjectVariants is absent — no regression", () => {
    const d = {
      globalStyle: STYLE,
      blocks: [{ id: "1", type: "signal", props: { title: "Block-derived headline" } }],
    } as EmailDoc;
    expect(deriveEmailDocSubject(d)).toBe("Block-derived headline");
  });
});
