// lib/email/lab/phone-tabs.ts — the grid lab's phone-tab contract (spec
// 2026-07-05-grid-lab-phone-design.md). Below the lg breakpoint the shell shows
// exactly ONE pane — the AI assistant ("build") or the canvas ("preview") —
// switched by a labeled bottom tab bar. Desktop (lg+) renders both panes and
// ignores this state entirely.
//
// Research base (crawl4ai 07/05/2026): web.dev Learn Design — a small screen is
// its own design, never a shrunken split-pane; NN/g "Tabs, Used Right" — one
// visible panel, short labels, clear selection. See the spec for the full
// findings list builders must follow on this surface.

export type PhoneTab = "build" | "preview";

/** Where a phone visitor lands is the promise made by the door they entered:
 *  a recipe handoff (hero address bar, pill "Make this") means their next act
 *  is firing the build → "build"; every other door (map ZIP click, /email-lab
 *  ?zip=, plain visit) promised a prebuilt email on canvas → "preview". */
export function initialPhoneTab(opts: { hasRecipe: boolean }): PhoneTab {
  return opts.hasRecipe ? "build" : "preview";
}
