// lib/email/render-email-doc.ts
//
// ONE root for EmailDoc → email HTML. Every surface that turns a saved
// block-canvas doc into sendable/previewable HTML (email-lab render route,
// deliverable blast route, scheduled-send runner) calls this — never the
// renderer pair directly — so the paid-grid branch can't silently diverge
// between preview and send (that divergence shipped: blast sent grid docs
// through the free stacker while preview compiled them).
//
// THERE IS ONE LIVE ENGINE. Corrected 08/03/2026 — the previous comment here
// described a "PAID grid / free tier" split, and a session read it back to the
// operator as current architecture. It is not:
//
//   `isGridDoc` is `blocks.some(b => b.layout != null)`. `finalizeDoc` — the ONE
//   seam every recipe goes through — writes a `layout` on EVERY block it emits
//   (design-system-reachability.test.ts asserts it). So every doc a recipe
//   produces takes the compileGrid branch, and the EmailDocEmail branch is
//   UNREACHABLE from the build path. Nothing in the tree strips layouts to
//   synthesize a layout-less doc.
//
// grid branch  — the live path: positioned doc → Cerberus hybrid columns +
//                Outlook ghost tables.
// stack branch — BACKCOMPAT ONLY: docs saved before the grid existed, which
//                carry no `layout` (lib/email/__tests__/block-canvas-backcompat.test.ts).
//                Keep it; it is not a tier, and it is not where new work goes.
//
// Component called as a function (no JSX in server modules).
// Map: docs/standards/emails.md §00.

import { render } from "@react-email/render";
import { EmailDocEmail } from "./blocks/EmailDocRenderer";
import { isGridDoc } from "./grid-schema";
import { compileGrid } from "./compile-grid";
import type { EmailDoc } from "./doc/types";

export async function renderEmailDocHtml(doc: EmailDoc): Promise<string> {
  return isGridDoc(doc.blocks) ? compileGrid(doc) : render(EmailDocEmail({ doc }));
}
