import { describe, expect, test } from "bun:test";
import { brandGlobalStyle } from "./apply-brand-style";
import type { EmailGlobalStyle } from "@/lib/email/doc/types";

const BASE: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

describe("brandGlobalStyle", () => {
  test("maps all wave-2 tokens onto globalStyle", () => {
    const gs = brandGlobalStyle(BASE, {
      PRIMARY: "#111111",
      FONT_BODY: "LATO_SANS",
      FONT_DISPLAY: "PLAYFAIR_SERIF",
      SURFACE: "#f0ede6",
      SURFACE_DARK: "#0f1d24",
    });
    expect(gs.primaryColor).toBe("#111111");
    expect(gs.fontFamily).toBe("LATO_SANS");
    expect(gs.displayFontFamily).toBe("PLAYFAIR_SERIF");
    expect(gs.surfaceColor).toBe("#f0ede6");
    expect(gs.surfaceDarkColor).toBe("#0f1d24");
  });

  test("absent tokens leave every field untouched (today's behavior)", () => {
    expect(brandGlobalStyle(BASE, {})).toEqual(BASE);
  });

  test("an invalid FONT_* token value is ignored, never applied", () => {
    const gs = brandGlobalStyle(BASE, { FONT_BODY: "papyrus" });
    expect(gs.fontFamily).toBe("MODERN_SANS");
  });

  // Fence 4 (2026-07-08 fence spec) — a serif display may never land on a
  // serif body. BOOK_SERIF and PLAYFAIR_SERIF are the only two serifs.
  test("serif body + serif display is rejected — display falls back, body still applies", () => {
    const gs = brandGlobalStyle(BASE, { FONT_BODY: "BOOK_SERIF", FONT_DISPLAY: "PLAYFAIR_SERIF" });
    expect(gs.fontFamily).toBe("BOOK_SERIF");
    expect(gs.displayFontFamily).toBeUndefined();
  });

  test("serif body + serif display is rejected even when a display font was already set", () => {
    const withDisplay: EmailGlobalStyle = { ...BASE, displayFontFamily: "MONTSERRAT_SANS" };
    const gs = brandGlobalStyle(withDisplay, {
      FONT_BODY: "PLAYFAIR_SERIF",
      FONT_DISPLAY: "BOOK_SERIF",
    });
    expect(gs.fontFamily).toBe("PLAYFAIR_SERIF");
    expect(gs.displayFontFamily).toBe("MONTSERRAT_SANS");
  });

  test("serif body + sans display is legal", () => {
    const gs = brandGlobalStyle(BASE, { FONT_BODY: "BOOK_SERIF", FONT_DISPLAY: "MODERN_SANS" });
    expect(gs.fontFamily).toBe("BOOK_SERIF");
    expect(gs.displayFontFamily).toBe("MODERN_SANS");
  });

  test("sans body + serif display is legal", () => {
    const gs = brandGlobalStyle(BASE, { FONT_BODY: "LATO_SANS", FONT_DISPLAY: "PLAYFAIR_SERIF" });
    expect(gs.fontFamily).toBe("LATO_SANS");
    expect(gs.displayFontFamily).toBe("PLAYFAIR_SERIF");
  });

  test("sans body + sans display is legal", () => {
    const gs = brandGlobalStyle(BASE, { FONT_BODY: "LATO_SANS", FONT_DISPLAY: "MONTSERRAT_SANS" });
    expect(gs.fontFamily).toBe("LATO_SANS");
    expect(gs.displayFontFamily).toBe("MONTSERRAT_SANS");
  });

  test("a body-only change that strands the untouched display font in serif+serif drops it", () => {
    const withSerifDisplay: EmailGlobalStyle = { ...BASE, displayFontFamily: "PLAYFAIR_SERIF" };
    // Only FONT_BODY is resubmitted — display was legal before (sans body),
    // now illegal (serif body) even though FONT_DISPLAY was never touched.
    const gs = brandGlobalStyle(withSerifDisplay, { FONT_BODY: "BOOK_SERIF" });
    expect(gs.fontFamily).toBe("BOOK_SERIF");
    expect(gs.displayFontFamily).toBeUndefined();
  });
});
