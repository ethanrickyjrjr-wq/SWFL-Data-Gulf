import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AiBriefcasePill } from "./AiBriefcasePill";

// hero_white_pill_size (docs/audit/2026-07-11-open-issues-after-triage.md): the FAB
// pill (btn-gradient rounded-full px-4 py-3) was the ONLY rounded-full px-4 pill on
// the whole site using py-3 — every other pill button (SiteShell nav Log In / mobile
// Log In, plus every other rounded-full px-4 button across app/ and components/)
// uses py-2. That makes the FAB the visual outlier the operator noticed, not the nav.
describe("AiBriefcasePill", () => {
  it("sizes the FAB pill like every other rounded-full pill on the site (py-2), not a one-off py-3", () => {
    const html = renderToStaticMarkup(createElement(AiBriefcasePill, {}));
    expect(html).toContain("rounded-full px-4 py-2");
    expect(html).not.toContain("py-3");
  });
});
