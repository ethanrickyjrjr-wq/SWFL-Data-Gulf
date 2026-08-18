import { describe, it, expect } from "bun:test";
import {
  initialSocialStreamState,
  markTouchedElement,
  applySocialStreamEvent,
} from "@/lib/social/design/consume-stream";
import type { SocialDesign, SocialElement } from "@/lib/social/design/types";

function design(): SocialDesign {
  const elements: SocialElement[] = [
    {
      id: "head",
      type: "text",
      x: 0,
      y: 0,
      width: 400,
      height: 120,
      text: "Your text",
      fontSize: 56,
      fontFamily: "Arial",
      fill: "#ffffff",
    },
    {
      id: "price",
      type: "stat",
      x: 0,
      y: 200,
      width: 400,
      height: 200,
      value: "",
      label: "label",
      valueFontSize: 120,
      labelFontSize: 32,
      fill: "#ffffff",
      accent: "#3dc9c0",
    },
  ];
  return { version: 1, format: "portrait", background: "#0a141a", elements };
}

const textOf = (d: SocialDesign | null, id: string): string =>
  ((d?.elements.find((e) => e.id === id) as unknown as Record<string, unknown>)?.text as string) ??
  "";
const valueOf = (d: SocialDesign | null, id: string): string =>
  ((d?.elements.find((e) => e.id === id) as unknown as Record<string, unknown>)?.value as string) ??
  "";

describe("social consume-stream — the race rule, keyed by element id", () => {
  it("FM-RACE-1: a slot paints an untouched element", () => {
    let s = initialSocialStreamState(design());
    s = applySocialStreamEvent(s, { e: "slot", id: "head", text: "Medians up 4%" });
    expect(textOf(s.design, "head")).toBe("Medians up 4%");
  });

  it("FM-RACE-2: a slot for a TOUCHED element is ignored — the human wins mid-stream", () => {
    let s = initialSocialStreamState(design());
    s = markTouchedElement(s, "head");
    s.design = {
      ...s.design!,
      elements: s.design!.elements.map((e) =>
        e.id === "head" ? ({ ...e, text: "the human wrote this" } as SocialElement) : e,
      ),
    };
    s = applySocialStreamEvent(s, { e: "slot", id: "head", text: "the AI wrote this" });
    expect(textOf(s.design, "head")).toBe("the human wrote this");
  });

  it("FM-RACE-3: `done`'s FULL patch merges AROUND a touched element, even one a slot already filled", () => {
    let s = initialSocialStreamState(design());
    // 1) the AI fills it live
    s = applySocialStreamEvent(s, { e: "slot", id: "head", text: "the AI wrote this" });
    expect(textOf(s.design, "head")).toBe("the AI wrote this");
    // 2) the human edits it while the rest of the build is still running
    s = markTouchedElement(s, "head");
    s.design = {
      ...s.design!,
      elements: s.design!.elements.map((e) =>
        e.id === "head" ? ({ ...e, text: "the human wrote this" } as SocialElement) : e,
      ),
    };
    // 3) `done` arrives carrying that same id in the patch
    s = applySocialStreamEvent(s, {
      e: "done",
      payload: {
        patch: { head: { text: "the AI wrote this" }, price: { value: "$412K", label: "median" } },
      },
    });
    expect(textOf(s.design, "head")).toBe("the human wrote this");
    // untouched ids still land — a stat fills here because slots cannot address it
    expect(valueOf(s.design, "price")).toBe("$412K");
    expect(s.finished).toBe(true);
    expect(s.statusLabel).toBeNull();
  });

  it("FM-RACE-4: an AUTHOR `done` reseats the design wholesale but keeps a touched matching id", () => {
    let s = initialSocialStreamState(design());
    s = markTouchedElement(s, "head");
    s.design = {
      ...s.design!,
      elements: s.design!.elements.map((e) =>
        e.id === "head" ? ({ ...e, text: "the human wrote this" } as SocialElement) : e,
      ),
    };
    const authored = design();
    authored.elements = [
      { ...(authored.elements[0] as SocialElement), text: "server headline" } as SocialElement,
      { ...(authored.elements[1] as SocialElement), id: "brandNew" } as SocialElement,
    ];
    s = applySocialStreamEvent(s, { e: "done", payload: { design: authored } });
    expect(textOf(s.design, "head")).toBe("the human wrote this");
    // an id the previous canvas never had reseats wholesale
    expect(s.design!.elements.some((e) => e.id === "brandNew")).toBe(true);
    expect(s.design!.elements.some((e) => e.id === "price")).toBe(false);
  });

  it("FM-RACE-5: status / error / the email lane's own events", () => {
    let s = initialSocialStreamState(design());
    s = applySocialStreamEvent(s, { e: "status", label: "reading the lake" });
    expect(s.statusLabel).toBe("reading the lake");
    const before = s.design;
    // skeleton/block are the EMAIL canvas's events — the social reducer ignores them
    s = applySocialStreamEvent(s, { e: "block", id: "head", props: { text: "nope" } });
    expect(s.design).toBe(before);
    s = applySocialStreamEvent(s, { e: "error", message: "fill_failed" });
    expect(s.errorMessage).toBe("fill_failed");
    expect(s.statusLabel).toBeNull();
    expect(s.finished).toBe(false);
  });
});
