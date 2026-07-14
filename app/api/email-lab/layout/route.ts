// app/api/email-lab/layout/route.ts
//
// THE USER'S OWN GRID for a recipe — "build the next one the same way I built the
// last one" (operator, 07/13/2026). Thin HTTP wrapper; every rule lives in
// lib/email/doc/layout-store.ts + saved-layout.ts.
//
//   GET  ?recipe=new-listing  → { hasLayout, subjectLabel } — what the popup asks about
//   PUT  { recipeKey, doc, subjectLabel } → saves THIS build's grid as their default
//   DELETE ?recipe=new-listing → back to the standard grid
//
// The doc PUT here is stripped of every content field before it is written (the store
// does it — a caller cannot store a listing). Reads and writes ride the cookie-auth'd
// client, so RLS is what makes a layout private, not a WHERE clause we could forget.

import { NextRequest, NextResponse } from "next/server";
import { isRecipeKey } from "@/lib/deliverable/recipes";
import { clearUserLayout, layoutSummary, saveUserLayout } from "@/lib/email/doc/layout-store";

export async function GET(req: NextRequest) {
  const recipe = req.nextUrl.searchParams.get("recipe") ?? "";
  if (!isRecipeKey(recipe)) return NextResponse.json({ hasLayout: false });

  const summary = await layoutSummary(recipe);
  return NextResponse.json({
    hasLayout: summary !== null,
    subjectLabel: summary?.subjectLabel ?? null,
    savedAt: summary?.savedAt ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    recipeKey?: string;
    doc?: unknown;
    /** The listing they built it for ("326 Shore Dr") — display only, for the ask. */
    subjectLabel?: string;
  };

  if (!isRecipeKey(body.recipeKey ?? "")) {
    return NextResponse.json({ saved: false, error: "Unknown recipe." }, { status: 400 });
  }
  if (body.doc === undefined) {
    return NextResponse.json({ saved: false, error: "No document." }, { status: 400 });
  }

  const saved = await saveUserLayout(body.recipeKey!, body.doc, body.subjectLabel);
  // A failed save is never loud: the user's email is fine, they just won't be offered
  // this grid next time. Never block a build on a preference write.
  return NextResponse.json({ saved });
}

export async function DELETE(req: NextRequest) {
  const recipe = req.nextUrl.searchParams.get("recipe") ?? "";
  if (!isRecipeKey(recipe)) {
    return NextResponse.json({ cleared: false, error: "Unknown recipe." }, { status: 400 });
  }
  return NextResponse.json({ cleared: await clearUserLayout(recipe) });
}
