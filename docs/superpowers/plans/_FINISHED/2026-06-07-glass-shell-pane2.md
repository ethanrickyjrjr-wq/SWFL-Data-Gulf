# The Glass — Shell + Pane 2 "The Calls" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, keywords: migration, schema, architecture

**Goal:** Build the `/glass` page in `swfldatagulf-ops` with a live Pane 2 rendering every open master prediction that carries a conditional claim, plus Wave-2 placeholders for the three remaining panes.

**Architecture:** Async Server Component (mirroring `/littlebird`) fetching three Supabase reads in parallel via `Promise.all`. A new shared library `lib/glass.ts` provides typed reader functions with the same `{ available, <entity> }` degradation pattern as `lib/checks.ts`. All components are server-side; CSS follows the `.glass-*` namespace over existing design tokens; no new dependencies.

**Tech Stack:** Next.js 15 App Router (server components), TypeScript, Supabase JS v2, pure CSS (no Tailwind).

---

## CRITICAL — Read this before touching any file

All work is in **`C:\Users\ethan\dev\swfldatagulf-ops`** — a separate repo with its own session. Never edit brain-platform files.

The ops repo has **no test runner**. Verification gates are:
1. `npm run dev` + visual inspection at `http://localhost:3000/glass`
2. `npm run build` (Next.js compile — no type errors, no lint errors)

Commit often. Use `node scripts/safe-push.mjs` (not raw `git push`) per RULE 1. Log entry required in `SESSION_LOG.md` before push.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/glass.ts` | **Create** | Types (`ConditionalClaim`, `OpenCall`, `GradedCall`) + 3 reader fns |
| `app/glass/calls.tsx` | **Create** | All Pane-2 components (`CallCard`, `ConfidenceBar`, `StatusChip`, `GradeTarget`, `ReceiptGrid`, `GlassPlaceholder`) |
| `app/glass/page.tsx` | **Create** | Async Server Component page shell |
| `app/globals.css` | **Edit ×2** | Add `.catnav-glass` near existing catnav block; add full `.glass-*` block at end |
| `app/page.tsx` | **Edit** | Insert `Glass ◊` catnav pill after Checks pill |
| `app/littlebird/page.tsx` | **Edit** | Add cross-link to `/glass` |

---

## Task 1: Verify DB shape (read-only — no file changes)

Confirm the two facts the code depends on. Takes ~3 min.

**Files:** none

- [ ] **Step 1: Count predictions by grade_status**

  Open the Supabase SQL editor for project `jtkdowmrjaxfvwmemxso` and run:

  ```sql
  SELECT grade_status, COUNT(*) AS n
  FROM predictions
  WHERE brain_id = 'master'
  GROUP BY grade_status
  ORDER BY n DESC;
  ```

  Expected result:

  | grade_status | n |
  |---|---|
  | pending | ~29 |
  | gradeable | ~6 |
  | ungradeable | ~5 |

  The `gradeable` + `ungradeable` rows (≈11 total) are the real calls. The `pending` rows are legacy husks with empty `conditional_claims`. The `.in("grade_status", ["gradeable","ungradeable"])` filter in `fetchOpenCalls` must exclude them.

- [ ] **Step 2: Confirm `outcomes` count and FK embed name**

  ```sql
  SELECT COUNT(*) FROM outcomes;
  -- Expected: 0

  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'outcomes'
  ORDER BY ordinal_position;
  -- Must include: prediction_id, predicted_direction, observed_direction,
  --               baseline_value, observed_value, direction_correct, error,
  --               graded_at, source_url, grade_method
  ```

  The FK is `outcomes.prediction_id → predictions.id` (single FK, no ambiguity). PostgREST embed string is therefore `predictions!inner(...)` — no constraint name suffix needed.

  If the column list above is **missing** any of `predicted_direction / observed_direction / direction_correct / graded_at`, the `20260531_grading_loop.sql` migration hasn't been applied yet. Run it now via Supabase SQL editor before proceeding.

- [ ] **Step 3: Spot-check one real call**

  ```sql
  SELECT id, grade_status, jsonb_array_length(conditional_claims) AS claim_count,
         gradeable_slug, window_end_date
  FROM predictions
  WHERE brain_id = 'master'
    AND grade_status IN ('gradeable','ungradeable')
  ORDER BY refined_at DESC
  LIMIT 3;
  ```

  Expected: `claim_count >= 1` for all returned rows. If any row shows `claim_count = 0`, it slipped through the status migration — note its `id` and skip it (the card will show "no claim detail recorded" gracefully).

---

## Task 2: Create `lib/glass.ts`

**Files:**
- Create: `lib/glass.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  // lib/glass.ts
  import { createClient } from "@supabase/supabase-js";

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

  function sb() {
    if (!SB_URL || !SB_KEY) return null;
    return createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    });
  }

  // ── Types ────────────────────────────────────────────────────────────────

  export interface ConditionalClaim {
    condition: string;
    then_direction: string;
    basis: string;
    basis_refs: string[];
    falsifier: string;
  }

  export interface OpenCall {
    id: string;
    brain_id: string;
    refined_at: string;
    conclusion: string;
    confidence: number;          // 0–1 float (e.g. 0.92 = 92%)
    prediction_window: string | null;
    conditional_claims: ConditionalClaim[];
    gradeable_slug: string | null;
    baseline_value: number | null;
    predicted_direction: string | null;
    window_end_date: string | null;
    grade_status: "gradeable" | "ungradeable";
  }

  export interface GradedCall {
    predicted_direction: string | null;
    observed_direction: string | null;
    baseline_value: number | null;
    observed_value: number | null;
    direction_correct: boolean | null;
    error: number | null;
    graded_at: string;
    source_url: string | null;
    // Embedded via predictions!inner(...) — PostgREST returns key "predictions"
    predictions: {
      brain_id: string;
      conclusion: string;
      confidence: number;
      gradeable_slug: string | null;
      window_end_date: string | null;
      conditional_claims: ConditionalClaim[];
    };
  }

  // ── Readers ──────────────────────────────────────────────────────────────

  /**
   * Open master calls that carry logged conditional_claims.
   * Explicitly filters to ['gradeable','ungradeable'] — NOT .neq('pending')
   * because that would pull the ~29 legacy husks with empty claims[].
   */
  export async function fetchOpenCalls(): Promise<{ available: boolean; calls: OpenCall[] }> {
    const client = sb();
    if (!client) return { available: false, calls: [] };

    const { data, error } = await client
      .from("predictions")
      .select(
        "id, brain_id, refined_at, conclusion, confidence, prediction_window, " +
        "conditional_claims, gradeable_slug, baseline_value, predicted_direction, " +
        "window_end_date, grade_status"
      )
      .in("grade_status", ["gradeable", "ungradeable"])
      .order("refined_at", { ascending: false })
      .limit(40);

    if (error || !data) return { available: false, calls: [] };
    return { available: true, calls: data as OpenCall[] };
  }

  /**
   * Machine-graded outcomes joined back to their parent prediction.
   * Returns 0 rows today (outcomes table is empty until grader resolves a window).
   * The !inner embed uses the single FK outcomes.prediction_id → predictions.id.
   */
  export async function fetchGradedCalls(): Promise<{ available: boolean; graded: GradedCall[] }> {
    const client = sb();
    if (!client) return { available: false, graded: [] };

    const { data, error } = await client
      .from("outcomes")
      .select(
        "predicted_direction, observed_direction, baseline_value, observed_value, " +
        "direction_correct, error, graded_at, source_url, " +
        "predictions!inner(brain_id, conclusion, confidence, gradeable_slug, window_end_date, conditional_claims)"
      )
      .order("graded_at", { ascending: false })
      .limit(20);

    if (error || !data) return { available: false, graded: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { available: true, graded: data as unknown as GradedCall[] };
  }

  /**
   * Count of legacy 'pending' master predictions (predate claim-logging).
   * Used for the honest footnote: "N earlier refines predate claim-logging."
   * Returns 0 on any error — footnote is informational only.
   */
  export async function fetchPendingHuskCount(): Promise<number> {
    const client = sb();
    if (!client) return 0;

    const { count, error } = await client
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("grade_status", "pending")
      .eq("brain_id", "master");

    if (error || count === null) return 0;
    return count;
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0 (or only the ~18 pre-existing baseline errors the repo already carries — no new errors from `lib/glass.ts`). If you see errors in `lib/glass.ts`, fix them before continuing.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/glass.ts
  git commit -m "feat(glass): add lib/glass.ts — types + reader fns for Pane 2"
  ```

---

## Task 3: Create `app/glass/calls.tsx`

All Pane-2 components. Server components only — no `"use client"` directive.

**Files:**
- Create: `app/glass/calls.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  // app/glass/calls.tsx
  import type { ConditionalClaim, GradedCall, OpenCall } from "@/lib/glass";

  // ── Utilities ─────────────────────────────────────────────────────────────

  function fmtDate(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isDueSoon(dateStr: string | null): boolean {
    if (!dateStr) return false;
    const msUntil = new Date(dateStr).getTime() - Date.now();
    return msUntil > 0 && msUntil < 14 * 24 * 60 * 60 * 1000;
  }

  // ── GlassPlaceholder ──────────────────────────────────────────────────────

  export function GlassPlaceholder({ section, wave }: { section: string; wave: number }) {
    return (
      <section className="glass-section glass-section--placeholder">
        <div className="glass-section-label">{section.toUpperCase()}</div>
        <div className="glass-placeholder">Ships in Wave {wave}</div>
      </section>
    );
  }

  // ── StatusChip ────────────────────────────────────────────────────────────

  export function StatusChip({ call }: { call: OpenCall }) {
    if (isDueSoon(call.window_end_date)) {
      return <span className="glass-chip glass-chip--due">due soon</span>;
    }
    return <span className="glass-chip glass-chip--open">open</span>;
  }

  // ── ConfidenceBar ─────────────────────────────────────────────────────────

  export function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    return (
      <div className="glass-confidence-bar">
        <div className="glass-progress-track">
          {/* Uses existing .progress-fill idiom — width set inline */}
          <div className="progress-fill glass-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="glass-confidence-label">{pct}%</span>
      </div>
    );
  }

  // ── ClaimRow (internal) ───────────────────────────────────────────────────

  function ClaimRow({ claim }: { claim: ConditionalClaim }) {
    return (
      <div className="glass-claim">
        <div className="glass-claim-condition">
          <span className="glass-claim-if">{claim.condition}</span>
          <span className="glass-claim-arrow">→</span>
          <span className={`glass-claim-direction glass-claim-direction--${claim.then_direction}`}>
            {claim.then_direction}
          </span>
        </div>
        <div className="glass-claim-basis">
          <span className="glass-claim-basis-label">{claim.basis}</span>
          {claim.basis_refs.map((ref) => (
            <span key={ref} className="chip">
              {ref}
            </span>
          ))}
        </div>
        <div className="glass-claim-falsifier">
          <span className="glass-falsifier-label">falsifier:</span> {claim.falsifier}
        </div>
      </div>
    );
  }

  // ── GradeTarget (internal) ────────────────────────────────────────────────

  function GradeTarget({ call }: { call: OpenCall }) {
    if (call.gradeable_slug && call.window_end_date) {
      return (
        <div className="glass-grade-target">
          graded against:{" "}
          <span className="chip">{call.gradeable_slug}</span>
          {call.baseline_value !== null && (
            <span className="glass-baseline"> baseline {call.baseline_value}</span>
          )}{" "}
          · settles by {fmtDate(call.window_end_date)}
        </div>
      );
    }
    return (
      <div className="glass-grade-target glass-grade-target--ungradeable">
        not yet gradeable — no registered numeric driver
      </div>
    );
  }

  // ── CallCard ──────────────────────────────────────────────────────────────

  export function CallCard({ call }: { call: OpenCall }) {
    const claims = Array.isArray(call.conditional_claims) ? call.conditional_claims : [];
    return (
      <div className="glass-call-card">
        <div className="glass-call-header">
          <span className="glass-call-conclusion">{call.conclusion}</span>
          <StatusChip call={call} />
        </div>

        {claims.length > 0 ? (
          <div className="glass-claims">
            {claims.map((c, i) => (
              <ClaimRow key={i} claim={c} />
            ))}
          </div>
        ) : (
          <div className="glass-empty-claims">no claim detail recorded</div>
        )}

        <div className="glass-call-footer">
          <ConfidenceBar value={call.confidence} />
          <GradeTarget call={call} />
          <div className="glass-refined-at">refined {fmtDate(call.refined_at)}</div>
        </div>
      </div>
    );
  }

  // ── ReceiptGrid ───────────────────────────────────────────────────────────

  export function ReceiptGrid({ graded }: { graded: GradedCall[] }) {
    return (
      <div className="glass-receipt-list">
        {graded.map((g, i) => (
          <div key={i} className="glass-receipt">
            <div className="glass-receipt-header">
              <span className="glass-receipt-conclusion">{g.predictions.conclusion}</span>
              <span
                className={`glass-chip ${
                  g.direction_correct === true
                    ? "glass-chip--hit"
                    : g.direction_correct === false
                    ? "glass-chip--miss"
                    : "glass-chip--open"
                }`}
              >
                {g.direction_correct === true
                  ? "✓ correct"
                  : g.direction_correct === false
                  ? "✗ miss"
                  : "pending"}
              </span>
            </div>
            <div className="glass-receipt-grid">
              <div className="glass-receipt-cell">
                <span className="glass-receipt-cell-label">predicted</span>
                <span className="glass-receipt-cell-value">{g.predicted_direction ?? "—"}</span>
                {g.baseline_value !== null && (
                  <span className="glass-receipt-mono">{g.baseline_value}</span>
                )}
              </div>
              <div className="glass-receipt-cell">
                <span className="glass-receipt-cell-label">observed</span>
                <span className="glass-receipt-cell-value">{g.observed_direction ?? "—"}</span>
                {g.observed_value !== null && (
                  <span className="glass-receipt-mono">{g.observed_value}</span>
                )}
              </div>
              {g.error !== null && (
                <div className="glass-receipt-cell">
                  <span className="glass-receipt-cell-label">error</span>
                  <span className="glass-receipt-mono">{g.error.toFixed(3)}</span>
                </div>
              )}
            </div>
            <div className="glass-receipt-meta">
              graded {fmtDate(g.graded_at)}
              {g.source_url && (
                <>
                  {" · "}
                  <a
                    href={g.source_url}
                    className="glass-receipt-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    source ↗
                  </a>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no new errors from `app/glass/calls.tsx`. If the compiler complains about `key={i}` on JSX elements from a map, that's a lint warning at most — not a type error.

- [ ] **Step 3: Commit**

  ```bash
  git add app/glass/calls.tsx
  git commit -m "feat(glass): add calls.tsx components — CallCard, ReceiptGrid, GlassPlaceholder"
  ```

---

## Task 4: Add `.glass-*` CSS to `app/globals.css`

**Files:**
- Modify: `app/globals.css` (append at end of file)

- [ ] **Step 1: Append the `.catnav-glass` rule near existing catnav variants**

  Find the existing block that ends with `.catnav-read:hover` (around line 290 area — search for `catnav-read`). Add immediately after it:

  ```css
  .catnav-glass {
    border-color: rgba(45, 212, 191, 0.22);
    color: var(--teal);
  }
  .catnav-glass:hover {
    border-color: var(--teal);
    background: rgba(45, 212, 191, 0.08);
  }
  ```

- [ ] **Step 2: Append the full `.glass-*` block at the very end of the file**

  ```css
  /* ─── The Glass ──────────────────────────────────────────────────────── */

  .glass-wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: 28px 24px 80px;
  }

  .glass-topbar {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 28px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .glass-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .glass-token {
    font-size: 11px;
    font-family: "IBM Plex Mono", monospace;
    color: var(--muted);
    margin-left: auto;
  }

  .glass-section {
    margin-bottom: 32px;
  }

  .glass-section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
  }

  .glass-section--placeholder {
    opacity: 0.4;
  }

  .glass-placeholder {
    font-size: 12px;
    font-style: italic;
    color: var(--muted);
    padding: 14px 16px;
    border: 1px dashed var(--border);
    border-radius: 8px;
  }

  .glass-unavailable,
  .glass-empty {
    font-size: 12px;
    font-style: italic;
    color: var(--muted);
    padding: 12px 0;
  }

  /* ── Call cards ───── */

  .glass-call-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .glass-call-card {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
  }

  .glass-call-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 12px;
  }

  .glass-call-conclusion {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.4;
  }

  .glass-claims {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }

  .glass-claim {
    padding: 10px 12px;
    background: var(--bg-deep);
    border-radius: 6px;
    border-left: 2px solid var(--teal);
  }

  .glass-claim-condition {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .glass-claim-if {
    font-size: 12px;
    color: var(--text);
    line-height: 1.4;
  }

  .glass-claim-arrow {
    color: var(--muted);
    font-size: 12px;
    flex-shrink: 0;
  }

  .glass-claim-direction {
    font-size: 12px;
    font-weight: 700;
    font-family: "IBM Plex Mono", monospace;
    flex-shrink: 0;
  }

  .glass-claim-direction--bullish { color: var(--green); }
  .glass-claim-direction--bearish { color: var(--red); }
  .glass-claim-direction--neutral { color: var(--muted); }

  .glass-claim-basis {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .glass-claim-basis-label {
    font-size: 11px;
    color: var(--muted);
  }

  .glass-claim-falsifier {
    font-size: 11px;
    color: var(--muted);
    font-style: italic;
    margin-top: 4px;
  }

  .glass-falsifier-label {
    font-weight: 600;
    color: var(--teal);
    font-style: normal;
  }

  .glass-call-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .glass-empty-claims {
    font-size: 11px;
    font-style: italic;
    color: var(--muted);
    padding: 4px 0 8px;
  }

  .glass-call-count {
    font-size: 11px;
    color: var(--muted);
    margin-top: 10px;
  }

  .glass-husk-note {
    font-style: italic;
  }

  /* ── Confidence bar ───── */

  .glass-confidence-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .glass-progress-track {
    flex: 1;
    height: 4px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }

  /* Specialise the existing .progress-fill fill colour for Glass */
  .glass-progress-fill {
    background: var(--teal);
  }

  .glass-confidence-label {
    font-size: 11px;
    font-family: "IBM Plex Mono", monospace;
    color: var(--teal);
    min-width: 28px;
    text-align: right;
  }

  /* ── Grade target ───── */

  .glass-grade-target {
    font-size: 11px;
    color: var(--muted);
  }

  .glass-grade-target--ungradeable {
    color: var(--yellow);
  }

  .glass-baseline {
    font-family: "IBM Plex Mono", monospace;
    font-size: 10px;
    color: var(--muted);
  }

  .glass-refined-at {
    font-size: 10px;
    color: var(--muted);
    opacity: 0.7;
  }

  /* ── Status chips ───── */

  .glass-chip {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    border-radius: 10px;
    padding: 2px 9px;
    text-transform: uppercase;
    font-family: "IBM Plex Mono", monospace;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .glass-chip--open {
    background: rgba(45, 212, 191, 0.1);
    color: var(--teal);
  }

  .glass-chip--due {
    background: rgba(252, 211, 77, 0.15);
    color: var(--yellow);
  }

  .glass-chip--ungradeable {
    background: rgba(107, 135, 148, 0.12);
    color: var(--muted);
  }

  .glass-chip--hit {
    background: rgba(74, 222, 128, 0.12);
    color: var(--green);
  }

  .glass-chip--miss {
    background: rgba(248, 113, 113, 0.12);
    color: var(--red);
  }

  /* ── Receipt grid ───── */

  .glass-receipt-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .glass-receipt {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }

  .glass-receipt-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }

  .glass-receipt-conclusion {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.4;
  }

  .glass-receipt-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 8px;
  }

  .glass-receipt-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .glass-receipt-cell-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .glass-receipt-cell-value {
    font-size: 12px;
    color: var(--text);
  }

  .glass-receipt-mono {
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    color: var(--muted);
  }

  .glass-receipt-meta {
    font-size: 11px;
    color: var(--muted);
  }

  .glass-receipt-link {
    color: var(--teal);
    text-decoration: none;
    opacity: 0.8;
  }

  .glass-receipt-link:hover {
    opacity: 1;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/globals.css
  git commit -m "feat(glass): add .glass-* CSS + .catnav-glass color variant"
  ```

---

## Task 5: Create `app/glass/page.tsx`

**Files:**
- Create: `app/glass/page.tsx`

- [ ] **Step 1: Create the directory and file**

  ```bash
  mkdir -p app/glass
  ```

  ```tsx
  // app/glass/page.tsx
  import { getMasterHealth } from "@/lib/master-health";
  import { fetchOpenCalls, fetchGradedCalls, fetchPendingHuskCount } from "@/lib/glass";
  import { CallCard, ReceiptGrid, GlassPlaceholder } from "./calls";

  export const revalidate = 300;

  export default async function GlassPage() {
    const [masterHealth, callsResult, gradedResult, pendingCount] = await Promise.all([
      getMasterHealth(),
      fetchOpenCalls(),
      fetchGradedCalls(),
      fetchPendingHuskCount(),
    ]);

    const token =
      masterHealth.freshnessToken ??
      "freshness unavailable — could not read master health";

    const { available: callsAvailable, calls } = callsResult;
    const { available: gradedAvailable, graded } = gradedResult;

    return (
      <div className="glass-wrap">
        {/* ── Topbar ── */}
        <div className="glass-topbar">
          <span className="glass-title">The Glass ◊</span>
          <span className="glass-token">{token}</span>
        </div>

        {/* ── Pane 2: The Calls ── */}
        <section className="glass-section">
          <div className="glass-section-label">THE CALLS</div>
          {!callsAvailable ? (
            <div className="glass-unavailable">signal unavailable</div>
          ) : calls.length === 0 ? (
            <div className="glass-empty">no calls logged yet</div>
          ) : (
            <>
              <div className="glass-call-grid">
                {calls.map((call) => (
                  <CallCard key={call.id} call={call} />
                ))}
              </div>
              <div className="glass-call-count">
                {calls.length} open call{calls.length !== 1 ? "s" : ""}
                {pendingCount > 0 && (
                  <span className="glass-husk-note">
                    {" · "}
                    {pendingCount} earlier refine
                    {pendingCount !== 1 ? "s" : ""} predate claim-logging
                  </span>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── Graded receipts (empty today; renders when outcomes > 0) ── */}
        {gradedAvailable && graded.length > 0 && (
          <section className="glass-section">
            <div className="glass-section-label">
              RECEIPTS ({graded.length})
            </div>
            <ReceiptGrid graded={graded} />
          </section>
        )}

        {/* ── Wave 2 placeholders ── */}
        <GlassPlaceholder section="The Flow" wave={2} />
        <GlassPlaceholder section="The Scoreboard" wave={2} />
        <GlassPlaceholder section="Shopping List" wave={2} />
      </div>
    );
  }
  ```

- [ ] **Step 2: Start dev server and open `/glass`**

  ```bash
  npm run dev
  # then open http://localhost:3000/glass
  ```

- [ ] **Step 3: Visual check — Calls pane**

  Confirm each of these in the browser:

  - [ ] Freshness token renders in topbar (a `SWFL-…` string, not "freshness unavailable")
  - [ ] ~11 call cards render (none for `grade_status='pending'` husks — if you see ~40 cards, the filter is wrong)
  - [ ] Each card shows: conclusion headline, `open` or `due soon` chip, at least one claim row with `condition → direction`, basis chips, falsifier line, confidence bar with a `%` number, and either a "settles by DATE" line or "not yet gradeable — no registered numeric driver"
  - [ ] No card shows an empty claim section except cards that genuinely have `conditional_claims: []` (those should show "no claim detail recorded")
  - [ ] Husk footnote renders if `pendingCount > 0`: e.g. "29 earlier refines predate claim-logging"
  - [ ] Three Wave-2 placeholder boxes render below the calls (faded, dashed border)
  - [ ] Receipts section is **absent** (0 outcomes today — the section is conditionally rendered)

- [ ] **Step 4: Degraded-state check**

  Stop the dev server. In a new terminal:

  ```bash
  SUPABASE_URL="" SUPABASE_SERVICE_KEY="" npm run dev
  # open http://localhost:3000/glass
  ```

  Expected: "signal unavailable" renders in the Calls section. No crash. Stop the server and restart normally.

- [ ] **Step 5: Commit**

  ```bash
  git add app/glass/page.tsx
  git commit -m "feat(glass): add /glass page shell with live Pane 2 — Calls"
  ```

---

## Task 6: Wire catnav + cross-link

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/littlebird/page.tsx`

- [ ] **Step 1: Add Glass pill to `app/page.tsx`**

  Find the line that reads:
  ```tsx
        <Link href="/checks" className="catnav-pill catnav-checks">
          Checks ✓
        </Link>
  ```

  Add the Glass pill **before** it (so Glass appears next to the observability/tracking pills):

  ```tsx
        <Link href="/glass" className="catnav-pill catnav-glass">
          Glass ◊
        </Link>
        <Link href="/checks" className="catnav-pill catnav-checks">
          Checks ✓
        </Link>
  ```

- [ ] **Step 2: Add cross-link to `app/littlebird/page.tsx`**

  Find the `<h1>` or section header near the top of the LittleBird page (search for `lb-header` or the first `lb-section-label`). Add a small footer link at the bottom of the page, just before the closing `</div>` of the `.lb-wrap` container:

  ```tsx
        <div style={{ marginTop: 32, fontSize: 12, color: "var(--muted)" }}>
          <a href="/glass" style={{ color: "var(--teal)", textDecoration: "none" }}>
            The Glass ◊ →
          </a>{" "}
          — observability &amp; improvement loop
        </div>
  ```

  Place it as the last child of the top-level `lb-wrap` div, after all sections.

- [ ] **Step 3: Verify nav renders in browser**

  Open `http://localhost:3000` — confirm "Glass ◊" pill appears in the catnav with teal color. Click it — confirms you land on `/glass`. Open `http://localhost:3000/littlebird` — confirm "The Glass ◊ →" cross-link appears at the bottom.

- [ ] **Step 4: Commit**

  ```bash
  git add app/page.tsx app/littlebird/page.tsx
  git commit -m "feat(glass): wire catnav pill + LittleBird cross-link"
  ```

---

## Task 7: Final verification and build

**Files:** none

- [ ] **Step 1: Run production build**

  ```bash
  npm run build
  ```

  Expected: exits 0. The output should include a `/glass` route listed in the page tree. If you see TypeScript errors, fix them before proceeding. Common issues:
  - `as unknown as GradedCall[]` cast in `lib/glass.ts` — ensure both `unknown` and `GradedCall[]` are in place (direct `as GradedCall[]` can fail strict mode)
  - Missing `key` prop warnings (lint only, not build failures)

- [ ] **Step 2: Final visual scan**

  With `npm run dev` running, do one final pass at `http://localhost:3000/glass`:

  - [ ] Topbar: title + freshness token on same row, token right-aligned
  - [ ] Calls: N open cards, each with conclusion, chip, ≥1 claim, confidence bar (bar + %), grade target line
  - [ ] `ungradeable` calls show "not yet gradeable — no registered numeric driver" in yellow
  - [ ] `gradeable` calls show "settles by [DATE]" in muted grey
  - [ ] Three placeholder blocks at bottom, visually faded
  - [ ] No console errors in browser devtools

- [ ] **Step 3: Update SESSION_LOG.md and push**

  Before pushing, append a new entry at the top of `SESSION_LOG.md` (newest-first):

  ```
  ## 2026-06-07 (Sonnet 4.6 · main) — feat(glass): §1 Glass shell + Pane 2 live

  - **What:** New `/glass` page in swfldatagulf-ops dashboard — The Glass Wave 1 §1.
    `lib/glass.ts` (fetchOpenCalls/fetchGradedCalls/fetchPendingHuskCount), `app/glass/page.tsx`
    (async Server Component, revalidate=300), `app/glass/calls.tsx` (CallCard, ConfidenceBar,
    StatusChip, GradeTarget, ReceiptGrid, GlassPlaceholder), `.glass-*` CSS block + `.catnav-glass`.
  - **Result:** ~11 open master calls render with claim→direction, basis chips, falsifier, confidence
    bar, and grade target (or "not yet gradeable"). Legacy 29 pending husks excluded by
    `.in(['gradeable','ungradeable'])` filter. Three Wave-2 placeholders shown. Receipts section
    absent (0 outcomes). Degrades gracefully when SUPABASE_* unset.
  - **Next:** Wave 1 §2 (backtest engine, brain-platform) — critical path for Wave 2 panes.
  ```

  Then push:

  ```bash
  node scripts/safe-push.mjs
  ```

  Then open the Vercel dashboard (or run `vercel --prod`) after operator diff review.

---

## Self-review

**Spec coverage check:**

| Spec requirement | Covered in |
|---|---|
| `lib/glass.ts` with `{ available, calls }` / `{ available, graded }` pattern | Task 2 |
| `.in("grade_status", ["gradeable","ungradeable"])` — NOT `.neq("pending")` | Task 2, Step 1 |
| FK embed `predictions!inner(...)` verification | Task 1, Step 2 |
| `ProgressBar` NOT imported — use `.progress-fill` width-% idiom | Task 4 (`.glass-progress-fill`), Task 3 `ConfidenceBar` |
| `getMasterHealth().freshnessToken` → null → "freshness unavailable…" | Task 5, Step 1 |
| One card per open call with claim, basis chips, falsifier, confidence, grade target | Task 3 `CallCard` |
| `ungradeable` → "not yet gradeable — no registered numeric driver" | Task 3 `GradeTarget` |
| `gradeable` → concrete slug + date | Task 3 `GradeTarget` |
| Graded calls → `ReceiptGrid` (empty today) | Task 3 + Task 5 conditional render |
| Panes 1/3/4 → `GlassPlaceholder` | Task 3 + Task 5 |
| `export const revalidate = 300` | Task 5, Step 1 |
| `Promise.all` parallel fetch | Task 5, Step 1 |
| Nav catnav pill + littlebird cross-link | Task 6 |
| `npm run build` clean | Task 7, Step 1 |
| Degraded: `available: false` → "signal unavailable" | Task 5, Step 4 |
| Husk count footnote | Task 2 + Task 5 |
| `.glass-*` CSS namespace | Task 4 |
| `catnav-glass` color | Task 4, Step 1 |

All requirements covered. No placeholders, no TBDs.
