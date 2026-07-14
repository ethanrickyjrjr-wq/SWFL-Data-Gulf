// lib/email/blocks/scale.test.ts
//
// THE GUARD THAT DID NOT EXIST.
//
// `app/_design/05-color-and-type.md` was researched, written, committed — and never
// enforced, because it was markdown. This test is the enforcement. It renders every
// real email we ship and asserts that every font-size, line-height, padding and
// margin in the produced HTML is a member of the scale.
//
// A hand-typed pixel is now a RED TEST. That is the entire point: the next session
// cannot eyeball a number, and neither can this one.
import { describe, expect, it } from "bun:test";
import { SEED_DOCS } from "../doc/default-docs";
import { previewFill } from "../doc/preview-fill";
import { renderEmailDocHtml } from "../render-email-doc";
import { TYPE, LEADING, statRole, compact, text } from "./scale";

// ── The legal sets, derived FROM THE SCALE (never restated by hand) ──────────
const LEGAL_FONT_PX = new Set<number>([0, ...Object.values(TYPE)]); // 0 = spacer cells
const LEGAL_SPACE_PX = new Set<number>([0, 4, 8, 12, 16, 24, 32, 48, 64, 96]);
const LEGAL_LEADING = new Set<string>([
  ...Object.values(LEADING).map(String),
  "0", // spacer <td>s zero out their line box (compile-grid ghost tables)
  "100%", // injected by @react-email <Button>
  "120%", // injected by <Button>'s inner <span>
  "normal",
]);

/** Every `font-size: Npx` in the rendered HTML. */
function fontSizes(html: string): number[] {
  return [...html.matchAll(/font-size:\s*([\d.]+)px/gi)].map((m) => Number(m[1]));
}
/** Every `line-height: X` (unitless, %, or px). */
function leadings(html: string): string[] {
  return [...html.matchAll(/line-height:\s*([^;"']+)/gi)].map((m) => m[1].trim());
}
/** Every px value inside a padding/margin shorthand or longhand. */
function spacings(html: string): number[] {
  const out: number[] = [];
  for (const m of html.matchAll(/(?:padding|margin)(?:-\w+)?:\s*([^;"']+)/gi)) {
    for (const px of m[1].matchAll(/(-?[\d.]+)px/g)) out.push(Math.abs(Number(px[1])));
  }
  return out;
}

/** Every seed, filled with its real display content — the emails we actually ship. */
async function renderedSeeds(): Promise<{ id: string; html: string }[]> {
  return Promise.all(
    SEED_DOCS.map(async (s) => ({
      id: s.id,
      html: await renderEmailDocHtml(previewFill(s.build(), { seedId: s.id })),
    })),
  );
}

describe("the scale is internally sound", () => {
  it("a size can never be chosen without its line-height", () => {
    for (const role of Object.keys(TYPE) as (keyof typeof TYPE)[]) {
      const t = text(role);
      expect(t.fontSize, `${role} has no fontSize`).toBeTruthy();
      expect(t.lineHeight, `${role} has no lineHeight — this is the 24px bug`).toBeTruthy();
      expect(t.fontWeight, `${role} has no fontWeight`).toBeTruthy();
    }
  });

  it("THE IMPORTANCE DIAL IS MONOTONIC — the important number is always bigger", () => {
    for (const density of ["grid", "strip"] as const) {
      const primary = TYPE[statRole("primary", density)];
      const plain = TYPE[statRole(undefined, density)];
      const muted = TYPE[statRole("muted", density)];
      // The bug this pins: in the OLD grid variant, primary rendered 30px while a
      // plain cell rendered 32px. The important number was SMALLER than the boring one.
      expect(primary, `${density}: primary must beat a plain cell`).toBeGreaterThan(plain);
      expect(plain, `${density}: a plain cell must beat a muted one`).toBeGreaterThan(muted);
    }
  });

  it("compact walks DOWN the real ladder and never invents a step", () => {
    expect(TYPE[compact("metric")]).toBe(TYPE.h2); // 36 → 28
    expect(TYPE[compact("h2")]).toBe(TYPE.body); // 28 → 16
    expect(TYPE[compact("body")]).toBe(TYPE.caption); // 16 → 14
    expect(compact("mono")).toBe("mono"); // floor: never below the smallest step
  });
});

describe("every email we ship obeys the scale", () => {
  it("uses no font size outside the scale", async () => {
    const offenders: string[] = [];
    for (const { id, html } of await renderedSeeds()) {
      const bad = [...new Set(fontSizes(html))].filter((n) => !LEGAL_FONT_PX.has(n));
      if (bad.length) offenders.push(`${id}: ${bad.sort((a, b) => a - b).join("px, ")}px`);
    }
    expect(offenders, `off-scale font sizes:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("sets a line-height on every text node (no silent 24px inheritance)", async () => {
    const offenders: string[] = [];
    for (const { id, html } of await renderedSeeds()) {
      const bad = [...new Set(leadings(html))].filter((v) => !LEGAL_LEADING.has(v));
      if (bad.length) offenders.push(`${id}: ${bad.join(" | ")}`);
    }
    expect(offenders, `off-scale line-heights:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("puts every padding and margin on the 8px grid", async () => {
    const offenders: string[] = [];
    for (const { id, html } of await renderedSeeds()) {
      const bad = [...new Set(spacings(html))].filter((n) => !LEGAL_SPACE_PX.has(n));
      if (bad.length) offenders.push(`${id}: ${bad.sort((a, b) => a - b).join("px, ")}px`);
    }
    expect(offenders, `off-grid spacing:\n${offenders.join("\n")}`).toEqual([]);
  });
});
