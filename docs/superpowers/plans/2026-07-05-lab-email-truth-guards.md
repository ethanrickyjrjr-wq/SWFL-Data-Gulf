# Lab-Email Truth Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 8 files, keywords: migration, schema, architecture

**Goal:** A lab email can name the property the user asked about (lane-4 prompt anchors), an id-selected figure always carries its own honest label, and every unsubscribe link in sent HTML resolves.

**Architecture:** Three surgical guards on existing seams — the author engine's anchor set (`lib/email/author-doc.ts` + its `build-doc.ts` wiring), the authored-block assembly's label resolution, and a new pure HTML post-processor bound at the three send paths. No schema changes, no migrations, no new deps.

**Tech Stack:** TypeScript, bun:test, existing Zod EmailDoc schema.

**Spec:** `docs/superpowers/specs/2026-07-05-lab-email-truth-guards-design.md` · **Check:** `lab_email_truth_guards_live_verify` (already registered)

## Global Constraints

- Never invent a number: prompt anchors extend what prose may QUOTE (lane 4 — the user typed it); they never enter `recordedStrings`, so "sold/recorded" claims still require a recorded menu figure.
- Clamps are the schema maxima verbatim: stats label ≤ 60 (`StatItemSchema`), hero label ≤ 80 (`applyContent`).
- The literal dead href is exactly `#unsubscribe` (FooterBlock default, `lib/email/doc/default-docs.ts` footer props). Replace ALL occurrences; absence is a no-op.
- Verify with `bun test lib/email` (never bare `npx tsc`); finish with `bunx next build`.
- Commit after every task with explicit paths — never `git add -A`. Do NOT push (operator gate).

---

### Task 1: `bindUnsubscribeHref` pure helper

**Files:**
- Create: `lib/email/bind-unsubscribe.ts`
- Test: `lib/email/bind-unsubscribe.test.ts`

**Interfaces:**
- Produces: `bindUnsubscribeHref(html: string, href: string): string` — replaces every `href="#unsubscribe"` with `href="<href>"`; html without the literal returns unchanged. Tasks 2–4 consume it.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/bind-unsubscribe.test.ts
import { describe, test, expect } from "bun:test";
import { bindUnsubscribeHref } from "./bind-unsubscribe";

describe("bindUnsubscribeHref", () => {
  test("replaces the dead footer href with the real target", () => {
    const html = `<a href="#unsubscribe" style="color:#999">Unsubscribe</a>`;
    expect(bindUnsubscribeHref(html, "https://x.test/u?id=1")).toBe(
      `<a href="https://x.test/u?id=1" style="color:#999">Unsubscribe</a>`,
    );
  });

  test("replaces every occurrence", () => {
    const html = `<a href="#unsubscribe">a</a><a href="#unsubscribe">b</a>`;
    const out = bindUnsubscribeHref(html, "T");
    expect(out.includes("#unsubscribe")).toBe(false);
    expect(out.match(/href="T"/g)?.length).toBe(2);
  });

  test("no-op when the doc carries a real user-set unsubscribe link", () => {
    const html = `<a href="https://their-crm.test/unsub">Unsubscribe</a>`;
    expect(bindUnsubscribeHref(html, "T")).toBe(html);
  });

  test("token target passes through verbatim (broadcast lane)", () => {
    const html = `<a href="#unsubscribe">u</a>`;
    expect(bindUnsubscribeHref(html, "{{{RESEND_UNSUBSCRIBE_URL}}}")).toBe(
      `<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">u</a>`,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/bind-unsubscribe.test.ts`
Expected: FAIL — module `./bind-unsubscribe` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/email/bind-unsubscribe.ts
//
// The EmailDoc footer's default unsubscribeUrl is the literal "#unsubscribe"
// (lib/email/doc/default-docs.ts) — a dead link if it reaches a real send. Every
// send path binds it to its real target: the blast route to the per-recipient
// /api/unsubscribe URL, the scheduled + weekly-read broadcast lanes to the
// {{{RESEND_UNSUBSCRIBE_URL}}} token Resend (or the sender) substitutes
// per-recipient. A user-set real URL contains no "#unsubscribe" → no-op. PURE.

export function bindUnsubscribeHref(html: string, href: string): string {
  return html.split(`href="#unsubscribe"`).join(`href="${href}"`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/bind-unsubscribe.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/email/bind-unsubscribe.ts lib/email/bind-unsubscribe.test.ts
git commit -m "feat(email): bindUnsubscribeHref — pure binder for the doc footer's dead #unsubscribe link"
```

---

### Task 2: Bind per-recipient unsubscribe in the blast route

**Files:**
- Modify: `app/api/deliverables/[id]/blast/route.ts` (the `messageFor` closure, ~line 218)

**Interfaces:**
- Consumes: `bindUnsubscribeHref` (Task 1).
- Produces: nothing new — the per-recipient message html no longer contains `#unsubscribe`.

- [ ] **Step 1: Wire the binder**

In `route.ts`, add the import beside the other lib imports:

```ts
import { bindUnsubscribeHref } from "@/lib/email/bind-unsubscribe";
```

In `messageFor`, change the html line:

```ts
const html = withMergeTags(
  bindUnsubscribeHref(withFooter(baseHtml, webUrl, unsubUrl), unsubUrl),
  c,
);
```

- [ ] **Step 2: Verify**

Run: `bun test lib/email lib/deliverable` → all pass (no blast route tests exist; the binder is unit-tested in Task 1 and this is a one-call wire).
Run: `bunx eslint "app/api/deliverables/[id]/blast/route.ts"` → clean.

- [ ] **Step 3: Commit**

```bash
git add "app/api/deliverables/[id]/blast/route.ts"
git commit -m "fix(email): blast route binds the doc footer's #unsubscribe to the recipient's real unsubscribe URL"
```

---

### Task 3: Bind the token in the scheduled EmailDoc lane

**Files:**
- Modify: `lib/email/emaildoc-occurrence.ts` (where `renderDoc`'s html returns)
- Test: extend `lib/email/__tests__/scheduler.test.ts` (the block-canvas FULL SEAM test already renders through `buildEmailDocOccurrence`) — or the module's own test file if one exists (`lib/email/emaildoc-occurrence.test.ts`); check with `ls lib/email/emaildoc-occurrence*` first and put the test beside the existing ones.

**Interfaces:**
- Consumes: `bindUnsubscribeHref` (Task 1), `UNSUBSCRIBE_TOKEN` from `lib/email/scheduler`.
- Produces: `buildEmailDocOccurrence(...)`'s `emailDocHtml` never contains `#unsubscribe` — every schedule consumer (run-schedules) inherits the fix with zero adapter changes.

- [ ] **Step 1: Write the failing test**

Add to the emaildoc-occurrence tests (mirror the existing mock-deps pattern — `loadDeliverable`/`buildDoc`/`renderDoc` injected):

```ts
test("occurrence html binds the doc footer's #unsubscribe to the broadcast token", async () => {
  const built = await buildEmailDocOccurrence("d1", {
    loadDeliverable: async () => ({
      doc: defaultDoc(),
      instruction: null,
      scope_kind: null,
      scope_value: null,
      template: "block-canvas",
    }),
    buildDoc: async ({ rawDoc }) => rawDoc,
    renderDoc: async () =>
      `<html><body><a href="#unsubscribe">Unsubscribe</a></body></html>`,
  });
  expect(built?.emailDocHtml?.includes("#unsubscribe")).toBe(false);
  expect(built?.emailDocHtml?.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test emaildoc-occurrence` (or the scheduler test file if colocated)
Expected: FAIL — html still contains `#unsubscribe`.

- [ ] **Step 3: Implement**

In `lib/email/emaildoc-occurrence.ts`, import and wrap the rendered html at the point the occurrence's `emailDocHtml` is produced:

```ts
import { bindUnsubscribeHref } from "./bind-unsubscribe";
import { UNSUBSCRIBE_TOKEN } from "./scheduler";
// ... where the render result becomes emailDocHtml:
const emailDocHtml = bindUnsubscribeHref(await deps.renderDoc(doc), UNSUBSCRIBE_TOKEN);
```

(Adapt the exact variable names to the file — the invariant is: the returned `emailDocHtml` is bound.)

- [ ] **Step 4: Run tests**

Run: `bun test lib/email` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/email/emaildoc-occurrence.ts lib/email/__tests__/scheduler.test.ts
git commit -m "fix(email): scheduled EmailDoc occurrences bind #unsubscribe to the broadcast unsubscribe token"
```

---

### Task 4: Bind the token in weekly-read

**Files:**
- Modify: `lib/email/weekly-read/issue.ts` (`finalizeIssueHtml`)
- Test: the weekly-read test file beside it (check `ls lib/email/weekly-read/*.test.ts`)

**Interfaces:**
- Consumes: `bindUnsubscribeHref` (Task 1), `UNSUBSCRIBE_TOKEN` (already imported in `weekly-read/send.ts`; import into issue.ts).
- Produces: `finalizeIssueHtml` output never contains `#unsubscribe`; `send.ts`'s existing `split(UNSUBSCRIBE_TOKEN).join(unsubUrl)` then makes it per-recipient.

- [ ] **Step 1: Write the failing test**

```ts
test("finalizeIssueHtml binds the doc footer's #unsubscribe to the token", () => {
  const html = finalizeIssueHtml(
    `<html><body><a href="#unsubscribe">u</a></body></html>`,
    OPTS, // reuse the existing test fixture's FinalizeOpts
  );
  expect(html.includes("#unsubscribe")).toBe(false);
  expect(html.includes(UNSUBSCRIBE_TOKEN)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/weekly-read` → FAIL.

- [ ] **Step 3: Implement**

In `finalizeIssueHtml` (issue.ts), first line of the transformation:

```ts
import { bindUnsubscribeHref } from "../bind-unsubscribe";
import { UNSUBSCRIBE_TOKEN } from "../scheduler";
// inside finalizeIssueHtml, before the existing steps:
html = bindUnsubscribeHref(html, UNSUBSCRIBE_TOKEN);
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/weekly-read` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/email/weekly-read/issue.ts lib/email/weekly-read/*.test.ts
git commit -m "fix(email): weekly-read issues bind #unsubscribe to the unsubscribe token"
```

---

### Task 5: Lane-4 prompt anchors in the author engine

**Files:**
- 🔴 Modify: `lib/email/author-doc.ts` (new export beside `collectAnchorNumbers`, ~line 805)
- Modify: `lib/email/build-doc.ts:627` (anchor assembly in `authorDoc`)
- 🔴 Test: `lib/email/author-doc.test.ts` (existing) — new describe block

**Interfaces:**
- Consumes: `extractNumbers` (already imported in author-doc.ts from `lib/deliverable/narrative-lint`).
- Produces: `promptAnchors(prompt: string): string[]` — every numeric token the user typed; joins `collectAnchorNumbers`'s `extra` in build-doc.

- [ ] **Step 1: Write the failing tests**

```ts
import { promptAnchors, lintAuthoredProse, collectAnchorNumbers } from "./author-doc";

describe("promptAnchors — lane 4 (figures the user gave)", () => {
  test("extracts the street number and user-typed figures", () => {
    expect(
      promptAnchors("email for my listing at 16447 Rainbow Meadows Ct, offered near $1,200,000"),
    ).toEqual(["16447", "$1,200,000"]);
  });

  test("prose naming the prompt's address survives the lint", () => {
    const doc = docWithTextBody("Welcome to 16447 Rainbow Meadows Ct."); // reuse the file's existing doc-builder fixture
    const anchors = collectAnchorNumbers([], promptAnchors("my listing at 16447 Rainbow Meadows Ct"));
    const r = lintAuthoredProse(doc, anchors, []);
    expect(r.ok).toBe(true);
  });

  test("a prompt figure still cannot be dressed as a recorded sale", () => {
    const doc = docWithTextBody("It sold for $1,200,000 last month.");
    const anchors = collectAnchorNumbers([], promptAnchors("asking $1,200,000"));
    const r = lintAuthoredProse(doc, anchors, []); // recorded anchors EMPTY
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/author-doc.test.ts` → FAIL — `promptAnchors` not exported.

- [ ] **Step 3: Implement**

In `author-doc.ts`, beside `collectAnchorNumbers`:

```ts
/** Lane 4 — figures the user GAVE: every numeric token in the user's own prompt
 *  (the listing's street number, a figure they typed) is quotable prose. They are
 *  general anchors ONLY — never recorded anchors, so "sold for $X" still requires
 *  a recorded menu figure (RECORDED_CLAIM_RE gate unchanged). */
export function promptAnchors(prompt: string): string[] {
  return extractNumbers(prompt ?? "");
}
```

In `build-doc.ts` `authorDoc` (line ~627), change:

```ts
const anchorStrings = collectAnchorNumbers(lakeParts.figures, [
  ...chartGroundingNumbers,
  ...promptAnchors(prompt),
]);
```

(add `promptAnchors` to the existing `@/lib/email/author-doc` import block.)

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/author-doc.test.ts lib/email/build-doc*` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/email/author-doc.ts lib/email/author-doc.test.ts lib/email/build-doc.ts
git commit -m "feat(email): lane-4 prompt anchors — the author may quote figures the user typed (address survives the lint)"
```

---

### Task 6: Menu-label fidelity for id-selected figures

**Files:**
- 🔴 Modify: `lib/email/author-doc.ts` — the `assembleBlock` accessor (~line 497), the stats assembly (~line 578), the hero case in `applyContent` (~line 384), and one sentence in `authorSystem`'s DATA MENU paragraph (~line 320)
- 🔴 Test: `lib/email/author-doc.test.ts`

**Interfaces:**
- Consumes: `figuresById: Map<string, MarketFigure>` (already threaded into assembly); `MarketFigure.label`.
- Produces: any stats cell or hero whose value resolved via `value_figure` carries the MENU figure's label verbatim (clamped 60/80); authored labels apply only to literal/qualitative cells.

- [ ] **Step 1: Write the failing test**

```ts
describe("menu-label fidelity — an id-selected figure carries its own label", () => {
  test("a lying authored stats label is replaced by the menu figure's label", () => {
    const menuFigures = [
      { label: "ZIP 33908 median list price", value: "$299,900", source: "s", asOf: "2026-07-04" },
    ] as MarketFigure[];
    const doc = assembleAuthoredDoc({
      authored: {
        blocks: [
          {
            type: "stats",
            stats: [{ value_figure: "f0", label: "List Price" }], // misattribution attempt
          },
        ],
      } as AuthoredDoc,
      figuresById: figureMenuById(buildFigureMenu(menuFigures)),
      globalStyle: DEFAULT_GLOBAL_STYLE,
      anchorNumbers: ["$299,900"],
      chart: null,
      photo: null,
      defaultLinkUrl: undefined,
      assetsById: new Map(),
    });
    const stats = doc.blocks.find((b) => b.type === "stats")!.props as StatsProps;
    expect(stats.stats[0].label).toBe("ZIP 33908 median list price");
    expect(stats.stats[0].value).toBe("$299,900");
  });

  test("a literal qualitative cell keeps its authored label", () => {
    // same assembly, cell { value: "no data", label: "Custom" } (no value_figure,
    // no digits) → label stays "Custom".
  });
});
```

(Adapt the `assembleAuthoredDoc` args object to the file's existing test fixtures — the file already has assembly tests to copy the boilerplate from; keep the assertion lines exactly.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/author-doc.test.ts` → FAIL — label is "List Price".

- [ ] **Step 3: Implement**

In `assembleBlock` (~line 497), add a figure accessor beside `num`:

```ts
const fig = (id?: string) => (id ? figuresById.get(id) : undefined);
```

Stats assembly (~line 578) — the menu label wins whenever the value is id-selected:

```ts
const cells = (a.stats ?? [])
  .map((s) => {
    const f = fig(s.value_figure);
    return {
      value: (f?.value ?? anchoredStatValue(s.value ?? "", anchors)) as string,
      // Id-selected → the figure's OWN label (verbatim, clamped): a real number
      // must never ship under a label that re-attributes it ("List Price" on a
      // ZIP median was the Rainbow Meadows failure). Literal cells keep theirs.
      label: f?.label ? f.label.slice(0, 60) : (s.label ?? ""),
    };
  })
  .filter((c) => c.value !== "" || c.label !== "")
  .slice(0, 3);
```

Hero case in `applyContent` (~line 384) — `applyContent` receives `num`; extend its signature to also take `fig` (update the one call site at ~line 593), then:

```ts
case "hero": {
  const f = fig(a.value_figure);
  props.value = (f?.value ?? "").slice(0, 24);
  props.kicker = (a.kicker ?? "").slice(0, 60);
  props.label = (f?.label ?? a.label ?? a.title ?? "").slice(0, 80);
  props.prose = (a.prose ?? a.body ?? "").slice(0, 500);
  break;
}
```

`authorSystem` DATA MENU paragraph — append one sentence so the model stops authoring labels for selected figures:

```ts
"For any value_figure cell the system also writes that figure's own label; write your own label only on qualitative cells."
```

- [ ] **Step 4: Run the full email suite**

Run: `bun test lib/email` → all pass (existing assembly tests may pin old label behavior — update any that assert an authored label on an id-selected cell; the new behavior is the spec).

- [ ] **Step 5: Commit**

```bash
git add lib/email/author-doc.ts lib/email/author-doc.test.ts
git commit -m "feat(email): menu-label fidelity — id-selected figures carry their own label; misattribution structurally impossible"
```

---

### Task 7: Full gates + session log

- [ ] **Step 1:** `bun test lib/email lib/deliverable` → 0 fail.
- [ ] **Step 2:** `bunx next build` → green.
- [ ] **Step 3:** Append a SESSION_LOG.md entry (what shipped, the check name, gates), commit it:

```bash
git add SESSION_LOG.md
git commit -m "docs(session-log): lab-email truth guards built"
```

- [ ] **Step 4:** STOP — show `git log --oneline origin/main..HEAD` to the operator and ask before pushing (standing rule). Live-verify (`lab_email_truth_guards_live_verify`) is operator-run post-deploy: rebuild the Rainbow Meadows recipe email — address in prose, menu labels on stats, in-body unsubscribe resolves.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 5, Task 6 | `lib/email/author-doc.ts`, `lib/email/author-doc.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
