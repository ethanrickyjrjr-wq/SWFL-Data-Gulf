// inject-scoped-rules.test.mjs — the right rule arrives at the matching write, once.
// Failure modes: keyword misfire outside the path scope, repeat noise, or a rule that
// blocks (this surface must NEVER block — that is the injector contract).
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchScopedRules, SCOPED_RULES } from "./lib/scoped-rules.mjs";

const ids = (matches) => matches.map((r) => r.id);

test("h-screen in any styled file surfaces the layout rule", () => {
  const m = matchScopedRules("app/foo/page.tsx", '<div className="h-screen">');
  assert.ok(ids(m).includes("h-screen-dvh"));
});

test("fontFamily inside email/deliverable code surfaces the font guard", () => {
  const m = matchScopedRules("lib/email/render.tsx", "style={{ fontFamily: 'Playfair' }}");
  assert.ok(ids(m).includes("font-family-guard"));
});

test("fontFamily OUTSIDE the scoped path stays quiet — path and content must both hit", () => {
  const m = matchScopedRules("scripts/tooling.mjs", "const fontFamily = 'x'");
  assert.equal(ids(m).includes("font-family-guard"), false);
});

test("zip_code in ingest surfaces the ZIP gates", () => {
  const m = matchScopedRules("ingest/pipelines/foo.py", "df['zip_code'] = mailing_zip");
  assert.ok(ids(m).includes("zip-three-gates"));
});

test("supabase functions path surfaces the Deno import rule on any content", () => {
  const m = matchScopedRules("supabase/functions/x/index.ts", "import x from 'react'");
  assert.ok(ids(m).includes("deno-imports"));
});

test("an already-fired rule is suppressed — once per session", () => {
  const fired = new Set(["h-screen-dvh"]);
  const m = matchScopedRules("app/foo/page.tsx", "h-screen", fired);
  assert.equal(ids(m).includes("h-screen-dvh"), false);
});

test("no match → empty, never noise", () => {
  assert.deepEqual(matchScopedRules("lib/util/math.ts", "export const add = 1"), []);
});

test("every shipped rule has id, content pattern, and a pointer in its text", () => {
  for (const r of SCOPED_RULES) {
    assert.ok(r.id && r.content instanceof RegExp, `rule ${r.id} malformed`);
    assert.ok(
      /(docs\/|CLAUDE\.md|lib\/|_RESEARCH\/|RULE )/i.test(r.text),
      `rule ${r.id} carries no pointer to its owning doc`,
    );
  }
});
