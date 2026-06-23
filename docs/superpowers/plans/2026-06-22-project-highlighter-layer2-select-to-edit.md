# Project Highlighter Layer 2 — Select-to-Edit Inside the Deliverable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 8 files, keywords: architecture

**Goal:** Let a user select text inside an open deliverable's iframe, get a popup with two verbs — EDIT (AI-proposed one-line steers → confirm → re-fork) and ASK (project-grounded converse) — without touching `/p/*`, the edit route, or the global `use-highlight` listener.

**Architecture:** `DeliverableModal` attaches a `mouseup`/`selectionchange` listener to the same-origin iframe's `contentDocument`, translates the selection rect into parent-viewport coordinates, and renders a new `DeliverableHighlightPopup` fixed in the parent document. The EDIT verb fires a project-grounded `streamConverse` ask to generate 2–3 one-line steer suggestions, routes the confirmed steer to the existing `POST /api/deliverables/[id]/edit { instruction }` endpoint, and wires the result through `DeliverableLanes.handleEdit` (`:135`) which swaps the modal to the new version. The ASK verb reuses the Layer-1 `useConverse` hook with the project context fields.

**Tech Stack:** React 19, TypeScript, Bun test. No new dependencies — every import is from existing lib/components.

**HARD DEPENDENCY — DO NOT BUILD UNTIL MET:** Layer 1 (`ConverseInput` gains `context?`, `projectId?`, `pageContext?`, `briefcase?`; `HighlightPopup` gains those four `PopupProps`; `GlobalHighlighter` computes and passes them) **must be on `main`** before starting Task 2. Run `git log --oneline` and confirm the Layer-1 commit is present. If it's not, stop — rebase and retry after it lands.

## Global Constraints

- `ConverseInput` has `context?`, `projectId?`, `pageContext?`, `briefcase?` (Layer 1 adds these — verify before use).
- Never send prose to the edit route — only an `instruction: string`.
- No changes to `app/p/**`, `app/api/deliverables/[id]/edit/route.ts`, `lib/highlighter/use-highlight.ts`, `lib/highlighter/position.ts`, or `app/project/layout.tsx`.
- `bunx next build` is the TS gate. Bare `npx tsc` is NOT sufficient (misses errors the repo's TS 5.9.3 catches).
- Stage only the files you created or modified. Never `git add -A`.
- `react-hooks/set-state-in-effect`: only call setState via a previous-value-ref or transition pattern — never synchronously in an effect body. Pattern: see `HighlightPopup.tsx:134-138`.
- `SESSION_LOG.md` entry required before any `git push`; use `node scripts/safe-push.mjs`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/highlighter/use-iframe-selection.ts` | **CREATE** | Attach listeners to iframe `contentDocument`; translate rect to parent viewport; pure `translateRect` helper |
| `lib/highlighter/use-iframe-selection.test.ts` | **CREATE** | Unit-test `translateRect` (pure — no DOM needed) |
| `lib/highlighter/use-steer-suggestions.ts` | **CREATE** | Fire one project-grounded converse ask; parse streamed text into ≤3 steer lines |
| `lib/highlighter/use-steer-suggestions.test.ts` | **CREATE** | Unit-test `parseSteerLines` + `buildSteerQuestion` (pure) |
| `components/highlighter/DeliverableHighlightPopup.tsx` | **CREATE** | Two-panel popup: EDIT (steers + confirm) and ASK (converse chat); positioned in parent doc |
| `app/project/[id]/workspace/DeliverableModal.tsx` | **MODIFY** | Add `projectId` prop, `iframeRef`, `useIframeSelection`, project-context hooks, and popup render |
| `app/project/[id]/workspace/DeliverableLanes.tsx` | **MODIFY** | Thread `projectId` prop into `<DeliverableModal>` |

---

### Task 1: `useIframeSelection` — capture selection from iframe, translate to parent viewport

**Files:**
- Create: `lib/highlighter/use-iframe-selection.ts`
- Create: `lib/highlighter/use-iframe-selection.test.ts`

**Interfaces:**
- Produces: `export interface IframeSelection { text: string; rect: Rect }` (imports `Rect` from `@/lib/highlighter/position`)
- Produces: `export function translateRect(iframeRect: { top: number; left: number }, selRect: { top: number; left: number; width: number; height: number }): Rect`
- Produces: `export function useIframeSelection(iframeRef: React.RefObject<HTMLIFrameElement | null>): IframeSelection | null`

- [ ] **Step 1: Write failing tests for `translateRect`**

```ts
// lib/highlighter/use-iframe-selection.test.ts
import { test, expect } from "bun:test";
import { translateRect } from "./use-iframe-selection";

test("translateRect: offsets selection rect by iframe position", () => {
  const result = translateRect({ top: 100, left: 50 }, { top: 20, left: 30, width: 80, height: 16 });
  expect(result).toEqual({ top: 120, left: 80, width: 80, height: 16 });
});

test("translateRect: iframe at origin passes rect through unchanged", () => {
  const result = translateRect({ top: 0, left: 0 }, { top: 5, left: 10, width: 200, height: 24 });
  expect(result).toEqual({ top: 5, left: 10, width: 200, height: 24 });
});

test("translateRect: preserves width and height unchanged", () => {
  const result = translateRect({ top: 50, left: 50 }, { top: 10, left: 10, width: 300, height: 32 });
  expect(result.width).toBe(300);
  expect(result.height).toBe(32);
});
```

- [ ] **Step 2: Run to verify failures**

```
bun test lib/highlighter/use-iframe-selection.test.ts
```

Expected: FAIL — `translateRect` not defined.

- [ ] **Step 3: Implement `translateRect` and `useIframeSelection`**

```ts
// lib/highlighter/use-iframe-selection.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { Rect } from "@/lib/highlighter/position";

export interface IframeSelection {
  text: string;
  rect: Rect;
}

/**
 * Pure helper: offset a selection rect (iframe-viewport-relative) into the parent
 * document's viewport coordinate space (iframe's bounding rect as the origin).
 */
export function translateRect(
  iframeRect: { top: number; left: number },
  selRect: { top: number; left: number; width: number; height: number },
): Rect {
  return {
    top: selRect.top + iframeRect.top,
    left: selRect.left + iframeRect.left,
    width: selRect.width,
    height: selRect.height,
  };
}

/**
 * Listens for text selection inside a same-origin iframe's contentDocument and
 * returns the selected text + its rect translated into parent-viewport coordinates
 * (ready for `position: fixed` popup placement). Returns null when collapsed.
 *
 * Re-attaches listeners on every iframe `load` so they survive navigations inside
 * the iframe. Cleans up on unmount.
 */
export function useIframeSelection(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
): IframeSelection | null {
  const [selection, setSelection] = useState<IframeSelection | null>(null);
  // Stable cleanup ref so we never close over a stale contentDocument.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function attach() {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc) return;

      function capture() {
        const el = iframeRef.current;
        if (!el) return;
        const sel = el.contentWindow?.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          setSelection(null);
          return;
        }
        const text = sel.toString().trim();
        if (!text) {
          setSelection(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const selRect = range.getBoundingClientRect();
        const ifrRect = el.getBoundingClientRect();
        setSelection({ text, rect: translateRect(ifrRect, selRect) });
      }

      doc.addEventListener("mouseup", capture);
      doc.addEventListener("selectionchange", capture);
      cleanupRef.current = () => {
        doc.removeEventListener("mouseup", capture);
        doc.removeEventListener("selectionchange", capture);
      };
    }

    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();

    return () => {
      iframe.removeEventListener("load", attach);
      cleanupRef.current?.();
    };
  }, [iframeRef]);

  return selection;
}
```

- [ ] **Step 4: Run tests**

```
bun test lib/highlighter/use-iframe-selection.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add lib/highlighter/use-iframe-selection.ts lib/highlighter/use-iframe-selection.test.ts
git commit -m "feat(highlighter): useIframeSelection — same-origin iframe selection → parent-viewport rect"
```

---

### Task 2: `useSteerSuggestions` — parse AI-proposed steers from a converse stream

**Pre-condition:** Layer 1 is on `main`. Confirm `ConverseInput` in `lib/highlighter/converse.ts` has `context?`, `projectId?`, `pageContext?`, `briefcase?` fields before writing this hook.

**Files:**
- Create: `lib/highlighter/use-steer-suggestions.ts`
- Create: `lib/highlighter/use-steer-suggestions.test.ts`

**Interfaces:**
- Produces: `export function buildSteerQuestion(span: string): string`
- Produces: `export function parseSteerLines(text: string): string[]`
- Produces: `export interface SteerContext { context?: "project" | "outside"; projectId?: string; pageContext?: unknown; briefcase?: unknown }`
- Produces: `export function useSteerSuggestions(span: string, ctx: SteerContext, enabled: boolean): { steers: string[]; loading: boolean; error: string | null }`

- [ ] **Step 1: Write failing tests for the pure helpers**

```ts
// lib/highlighter/use-steer-suggestions.test.ts
import { test, expect } from "bun:test";
import { parseSteerLines, buildSteerQuestion } from "./use-steer-suggestions";

test("parseSteerLines: splits on newlines, strips bullet prefixes, caps at 3", () => {
  const text = "- Lead with the rent trend\n- Add flood risk callout\n- Mention YoY sales drop\n- Extra line ignored";
  const result = parseSteerLines(text);
  expect(result).toHaveLength(3);
  expect(result[0]).toBe("Lead with the rent trend");
  expect(result[1]).toBe("Add flood risk callout");
});

test("parseSteerLines: strips numbered list prefixes", () => {
  const text = "1. Lead with the rent trend\n2. Add flood risk callout";
  const result = parseSteerLines(text);
  expect(result[0]).toBe("Lead with the rent trend");
  expect(result[1]).toBe("Add flood risk callout");
});

test("parseSteerLines: strips asterisk bullets", () => {
  const text = "* Lead with the rent trend\n* Add flood risk callout";
  const result = parseSteerLines(text);
  expect(result[0]).toBe("Lead with the rent trend");
});

test("parseSteerLines: drops blank lines", () => {
  const text = "Lead with the rent trend\n\nAdd flood risk callout";
  expect(parseSteerLines(text)).toHaveLength(2);
});

test("parseSteerLines: returns empty array for empty input", () => {
  expect(parseSteerLines("")).toEqual([]);
  expect(parseSteerLines("   ")).toEqual([]);
});

test("buildSteerQuestion: includes the span verbatim", () => {
  const q = buildSteerQuestion("vacancy rate is 8.2%");
  expect(q).toContain("vacancy rate is 8.2%");
});

test("buildSteerQuestion: asks for one-line instructions", () => {
  const q = buildSteerQuestion("vacancy rate is 8.2%");
  expect(q).toContain("one-line");
});
```

- [ ] **Step 2: Run to verify failures**

```
bun test lib/highlighter/use-steer-suggestions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/highlighter/use-steer-suggestions.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { streamConverse, type ConverseInput } from "./converse";

const MAX_STEERS = 3;

export function buildSteerQuestion(span: string): string {
  return (
    `For this selected passage from a deliverable:\n"${span}"\n\n` +
    `Suggest up to ${MAX_STEERS} specific, one-line rebuild instructions. ` +
    `Example: "lead with the rent trend" or "add a risk callout for flood zone AA". ` +
    `One per line, no numbering, no extra prose.`
  );
}

export function parseSteerLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-•*\d.]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_STEERS);
}

export interface SteerContext {
  context?: "project" | "outside";
  projectId?: string;
  pageContext?: unknown;
  briefcase?: unknown;
}

/**
 * Fires ONE project-grounded converse ask when `enabled` turns true, streams the
 * response, and parses it into up to 3 one-line instruction strings. The `fired`
 * guard ensures the ask never repeats within a single popup lifetime — `span` and
 * `ctx` are frozen at first-fire time (the selection is immutable for this popup).
 */
export function useSteerSuggestions(
  span: string,
  ctx: SteerContext,
  enabled: boolean,
): { steers: string[]; loading: boolean; error: string | null } {
  const [steers, setSteers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!enabled || !span.trim() || fired.current) return;
    fired.current = true;
    setLoading(true);
    setSteers([]);
    setError(null);
    let acc = "";
    const input: ConverseInput = {
      context: ctx.context,
      projectId: ctx.projectId,
      pageContext: ctx.pageContext,
      briefcase: ctx.briefcase,
      question: buildSteerQuestion(span),
    };
    void streamConverse(input, {
      onText: (t) => {
        acc = t;
      },
      onDone: () => {
        setSteers(parseSteerLines(acc));
        setLoading(false);
      },
      onError: (m) => {
        setError(m);
        setLoading(false);
      },
    });
  }, [enabled, span, ctx.context, ctx.projectId, ctx.pageContext, ctx.briefcase]);

  return { steers, loading, error };
}
```

- [ ] **Step 4: Run tests**

```
bun test lib/highlighter/use-steer-suggestions.test.ts
```

Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add lib/highlighter/use-steer-suggestions.ts lib/highlighter/use-steer-suggestions.test.ts
git commit -m "feat(highlighter): useSteerSuggestions — parse AI-proposed one-line steers from converse stream"
```

---

### Task 3: `DeliverableHighlightPopup` — EDIT + ASK popup for in-deliverable selections

**Files:**
- Create: `components/highlighter/DeliverableHighlightPopup.tsx`

**Interfaces:**
- Consumes: `IframeSelection` from `@/lib/highlighter/use-iframe-selection`
- Consumes: `SteerContext`, `useSteerSuggestions` from `@/lib/highlighter/use-steer-suggestions`
- Consumes: `useConverse` from `@/lib/highlighter/use-converse` (Layer 1: `ask()` accepts `context`, `projectId`, `pageContext`, `briefcase`)
- Consumes: `popupPosition` from `@/lib/highlighter/position`
- Produces: `export function DeliverableHighlightPopup(props: Props): JSX.Element | null`

```ts
interface Props {
  deliverableId: string;
  selection: IframeSelection;        // text + rect (parent-viewport coords)
  projectId: string | null;
  context: "project" | "outside";
  pageContext?: unknown;
  briefcase?: unknown;
  confirming: boolean;               // parent is busy submitting the edit — lock button
  onConfirmEdit: (instruction: string) => void;
  onClose: () => void;
}
```

- [ ] **Step 1: Implement the component**

```tsx
// components/highlighter/DeliverableHighlightPopup.tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { popupPosition, type Position } from "@/lib/highlighter/position";
import { useSteerSuggestions, type SteerContext } from "@/lib/highlighter/use-steer-suggestions";
import { useConverse } from "@/lib/highlighter/use-converse";
import type { IframeSelection } from "@/lib/highlighter/use-iframe-selection";

interface Props {
  deliverableId: string;
  selection: IframeSelection;
  projectId: string | null;
  context: "project" | "outside";
  pageContext?: unknown;
  briefcase?: unknown;
  confirming: boolean;
  onConfirmEdit: (instruction: string) => void;
  onClose: () => void;
}

type Panel = "edit" | "ask";

export function DeliverableHighlightPopup({
  selection,
  projectId,
  context,
  pageContext,
  briefcase,
  confirming,
  onConfirmEdit,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const [panel, setPanel] = useState<Panel>("edit");
  const [selectedSteer, setSelectedSteer] = useState<string | null>(null);
  const [customSteer, setCustomSteer] = useState("");
  const [askInput, setAskInput] = useState("");
  const [lastAskQuestion, setLastAskQuestion] = useState("");

  const steerCtx: SteerContext = {
    context,
    projectId: projectId ?? undefined,
    pageContext,
    briefcase,
  };
  const { steers, loading: steersLoading, error: steersError } = useSteerSuggestions(
    selection.text,
    steerCtx,
    panel === "edit",
  );

  const converse = useConverse();

  // Position relative to the translated selection rect (parent-viewport coords).
  // Hidden until the first layout pass measures the popup's actual size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(
      popupPosition(
        selection.rect,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [selection]);

  const containerStyle: React.CSSProperties = {
    top: pos?.top ?? -9999,
    left: pos?.left ?? -9999,
    visibility: pos ? "visible" : "hidden",
  };

  const activeInstruction = selectedSteer ?? (customSteer.trim() || null);
  const canConfirm = activeInstruction !== null && !confirming;

  function submitAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed || converse.streaming) return;
    setLastAskQuestion(trimmed);
    setAskInput("");
    void converse.ask({
      context,
      projectId: projectId ?? undefined,
      pageContext,
      briefcase,
      question: trimmed,
      fact: selection.text,
    });
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Edit or ask about selection"
      className="fixed z-[70] flex w-[min(94vw,340px)] flex-col overflow-hidden rounded-xl border border-[#00d4aa]/60 bg-[#0d1e2b] text-sm text-gray-100 shadow-2xl shadow-black/60"
      style={containerStyle}
    >
      {/* Header — selected span preview + close */}
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <p className="line-clamp-2 min-w-0 flex-1 break-words font-mono text-xs text-[#00d4aa]">
          &ldquo;{selection.text.length > 120 ? `${selection.text.slice(0, 120)}…` : selection.text}&rdquo;
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3z" />
          </svg>
        </button>
      </div>

      {/* Panel tabs */}
      <div className="flex shrink-0 border-b border-white/10">
        {(["edit", "ask"] as Panel[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPanel(p)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              panel === p
                ? "border-b-2 border-[#00d4aa] text-[#00d4aa]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {p === "edit" ? "Edit" : "Ask"}
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div className="max-h-72 overflow-y-auto p-3">
        {panel === "edit" ? (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-400">
              Pick an AI-suggested steer or write your own, then rebuild.
            </p>

            {steersLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-[#00d4aa] border-t-transparent" />
                Suggesting steers…
              </div>
            )}

            {steersError && (
              <p className="text-[11px] text-amber-400">
                Couldn&apos;t generate suggestions — write one below.
              </p>
            )}

            {steers.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {steers.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSteer((prev) => (prev === s ? null : s));
                        setCustomSteer("");
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        selectedSteer === s
                          ? "border-[#00d4aa] bg-[#00d4aa]/15 text-[#00d4aa]"
                          : "border-white/15 bg-white/5 text-gray-200 hover:border-[#00d4aa]/60"
                      }`}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <label className="mb-1 block text-[11px] text-gray-400">
                {steers.length > 0 ? "Or write your own:" : "One-line steer:"}
              </label>
              <input
                type="text"
                value={customSteer}
                onChange={(e) => {
                  setCustomSteer(e.target.value);
                  if (e.target.value) setSelectedSteer(null);
                }}
                placeholder='e.g. "lead with the vacancy trend"'
                className="w-full rounded-md border border-white/15 bg-[#0a1722] px-2.5 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-[#00d4aa] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (activeInstruction) onConfirmEdit(activeInstruction);
              }}
              disabled={!canConfirm}
              className="btn-gradient w-full rounded-lg py-2 text-xs font-semibold text-navy-dark disabled:opacity-40"
            >
              {confirming ? "Rebuilding…" : "Confirm & Rebuild"}
            </button>
          </div>
        ) : (
          /* ASK panel — project-grounded converse */
          <div className="space-y-3">
            {converse.error && (
              <p className="text-xs text-red-400">{converse.error}</p>
            )}

            {converse.answer && (
              <div className="space-y-2">
                <p className="whitespace-pre-wrap text-xs leading-5 text-gray-200">
                  {converse.answer}
                  {converse.streaming && (
                    <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[#00d4aa]/80 align-middle" />
                  )}
                </p>
                {!converse.streaming && !converse.error && converse.answer && (
                  <button
                    type="button"
                    onClick={() => {
                      // Pre-fill EDIT panel's custom steer from the last question.
                      setCustomSteer(lastAskQuestion || "");
                      setSelectedSteer(null);
                      setPanel("edit");
                    }}
                    className="text-xs text-[#00d4aa] underline underline-offset-2 transition-colors hover:text-[#00d4aa]/80"
                  >
                    Rebuild with a steer →
                  </button>
                )}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitAsk(askInput);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitAsk(askInput);
                  }
                }}
                rows={2}
                placeholder={converse.answer ? "Ask a follow-up…" : "Ask about this passage…"}
                className="min-w-0 flex-1 resize-none rounded-lg border border-[#00d4aa]/40 bg-[#0a1722] px-2.5 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-[#00d4aa] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!askInput.trim() || converse.streaming}
                className="btn-gradient shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-navy-dark disabled:opacity-40"
              >
                Ask
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Partial type-check (catches import errors early)**

```
bunx next build 2>&1 | grep "DeliverableHighlightPopup" | head -20
```

Expected: no errors mentioning this file. If any import paths are wrong, fix them now.

- [ ] **Step 3: Commit**

```bash
git add components/highlighter/DeliverableHighlightPopup.tsx
git commit -m "feat(highlighter): DeliverableHighlightPopup — EDIT + ASK popup for in-deliverable selections"
```

---

### Task 4: Wire into `DeliverableModal` + thread `projectId` from `DeliverableLanes`

**Files:**
- Modify: `app/project/[id]/workspace/DeliverableLanes.tsx` (1 line added)
- Modify: `app/project/[id]/workspace/DeliverableModal.tsx` (full rewrite of the imports + props + body)

**Interfaces:**
- Consumes: `useIframeSelection` from `@/lib/highlighter/use-iframe-selection`
- Consumes: `DeliverableHighlightPopup` from `@/components/highlighter/DeliverableHighlightPopup`
- Consumes: `useAiContext` from `@/components/briefcase/use-ai-context` → `ProjectDigest | null`
- Consumes: `useBriefcase` from `@/components/briefcase/BriefcaseProvider` → `{ draftItems: ProjectItem[] }`
- Consumes: `describePage(pathname: string, project?: ProjectPageContext): string` from `@/lib/chat/page-context`
- Consumes: `projectPageContextForPath(path: string, digest: ProjectDigest | null): ProjectPageContext | undefined` from `@/lib/chat/page-context`
- Consumes: `briefcaseDigest(items: ProjectItem[]): string` from `@/lib/briefcase/briefcase-digest`

**VERIFY BEFORE CODING** — open these three files and confirm the exact signatures match the above before writing any import:
- `lib/chat/page-context.ts` — `describePage` + `projectPageContextForPath`
- `lib/briefcase/briefcase-digest.ts` — `briefcaseDigest`

If Layer 1 added any new exports to these files, adjust accordingly.

- [ ] **Step 1: Thread `projectId` in `DeliverableLanes.tsx`**

Find the `<DeliverableModal` JSX near line 238 of `DeliverableLanes.tsx`. Add one prop:

```tsx
<DeliverableModal
  deliverable={open}
  title={`${templateLabel(open.template)} · ${new Date(open.created_at).toLocaleDateString()}`}
  items={items}
  projectBranding={projectBranding}
  projectId={projectId}        {/* ADD THIS — DeliverableLanes already has it as a prop */}
  reloadNonce={reloadNonce}
  onClose={() => setOpenId(null)}
  onRefresh={handleRefresh}
  onEdit={handleEdit}
  onTrash={handleTrash}
/>
```

- [ ] **Step 2: Rewrite `DeliverableModal.tsx` to add the iframe ref + selection bridge + popup**

Replace the full file content:

```tsx
// app/project/[id]/workspace/DeliverableModal.tsx
"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import type { ProjectItem } from "@/lib/project/items";
import type { DeliverableRow, DeliverableEditPatch } from "./types";
import { DeliverableEditPanel } from "./DeliverableEditPanel";
import { useIframeSelection } from "@/lib/highlighter/use-iframe-selection";
import { DeliverableHighlightPopup } from "@/components/highlighter/DeliverableHighlightPopup";
import { useAiContext } from "@/components/briefcase/use-ai-context";
import { useBriefcase } from "@/components/briefcase/BriefcaseProvider";
import { describePage, projectPageContextForPath } from "@/lib/chat/page-context";
import { briefcaseDigest } from "@/lib/briefcase/briefcase-digest";

/**
 * "Open big" for a built deliverable (Piece 1 §D + Piece 4). The frozen page renders
 * in an `<iframe src="/p/[id]">`; P4 adds the action bar — Refresh (re-render against
 * today's data → new version), Edit (guided rebuild panel), Delete (soft-trash). The
 * iframe carries a `?r=<nonce>` cache-buster so a cosmetic in-place edit (same id)
 * reloads; a content edit/refresh swaps the modal to the new version's id (parent).
 *
 * Layer 2 adds: select text in the iframe → DeliverableHighlightPopup (EDIT/ASK verbs).
 * Same-origin assumption: /p/[id] and the parent are both swfldatagulf.com.
 */
export function DeliverableModal({
  deliverable: d,
  title,
  items,
  projectBranding,
  projectId,
  reloadNonce,
  onClose,
  onRefresh,
  onEdit,
  onTrash,
}: {
  deliverable: DeliverableRow;
  title: string;
  items: ProjectItem[];
  projectBranding: Record<string, string> | null;
  projectId: string;
  reloadNonce: number;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onEdit: (patch: DeliverableEditPatch) => Promise<{ id: string; inPlace: boolean } | null>;
  onTrash: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "refresh" | "trash" | "edit" | "highlight-edit">(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ALL hooks above any conditional return (React invariant).
  const pathname = usePathname() ?? "/";
  const digest = useAiContext();
  const briefcaseCtx = useBriefcase();
  // Mirror GlobalHighlighter's project-context computation exactly.
  const highlightContext = digest?.projectId ? "project" : "outside";
  const highlightPageContext = describePage(pathname, projectPageContextForPath(pathname, digest));
  const highlightBriefcase = briefcaseDigest(briefcaseCtx?.draftItems ?? []);

  // Selection capture — only meaningful when the iframe is visible (not the edit panel).
  const iframeSelection = useIframeSelection(iframeRef);
  const activeSelection = !editing ? iframeSelection : null;

  async function refresh() {
    if (busy) return;
    setBusy("refresh");
    await onRefresh();
    setBusy(null);
  }

  async function trash() {
    if (busy) return;
    setBusy("trash");
    await onTrash();
    setBusy(null);
  }

  async function handleHighlightEdit(instruction: string) {
    if (busy) return;
    setBusy("highlight-edit");
    const r = await onEdit({ instruction });
    setBusy(null);
    if (r) {
      // Clear the iframe selection — triggers selectionchange → hook sets null → popup closes.
      iframeRef.current?.contentWindow?.getSelection()?.removeAllRanges();
    }
  }

  function closeSelectionPopup() {
    iframeRef.current?.contentWindow?.getSelection()?.removeAllRanges();
  }

  return (
    <Modal title={title} onClose={onClose} widthClass="max-w-5xl">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            disabled={busy !== null}
            className="text-xs text-[#00d4aa] underline underline-offset-2 disabled:opacity-40"
          >
            {editing ? "Close editor" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy !== null}
            className="text-xs text-[#00d4aa] underline underline-offset-2 disabled:opacity-40"
          >
            {busy === "refresh" ? "Refreshing…" : "Refresh data"}
          </button>
          <button
            type="button"
            onClick={() => void trash()}
            disabled={busy !== null}
            className="text-xs text-red-400 underline underline-offset-2 disabled:opacity-40"
          >
            {busy === "trash" ? "Deleting…" : "Delete"}
          </button>
        </div>
        <a
          href={`/p/${d.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#00d4aa] underline underline-offset-2"
        >
          Open in new tab ↗
        </a>
      </div>

      {editing ? (
        <DeliverableEditPanel
          deliverable={d}
          items={items}
          projectBranding={projectBranding}
          disabled={busy !== null}
          onCancel={() => setEditing(false)}
          onRebuild={async (patch) => {
            if (busy) return null;
            setBusy("edit");
            const r = await onEdit(patch);
            setBusy(null);
            if (r) setEditing(false);
            return r;
          }}
        />
      ) : (
        <iframe
          ref={iframeRef}
          src={`/p/${d.id}?r=${reloadNonce}`}
          title={title}
          className="h-[78vh] w-full border-0 bg-white"
        />
      )}

      {/* In-deliverable selection popup — floats at z-[70] above the modal (z-[60]). */}
      {activeSelection && (
        <DeliverableHighlightPopup
          deliverableId={d.id}
          selection={activeSelection}
          projectId={projectId}
          context={highlightContext}
          pageContext={highlightPageContext}
          briefcase={highlightBriefcase}
          confirming={busy === "highlight-edit"}
          onConfirmEdit={(instruction) => void handleHighlightEdit(instruction)}
          onClose={closeSelectionPopup}
        />
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Run `bun test`**

```
bun test
```

Expected: same pass count as before this task. Confirm `page-mount-coverage.test.ts` is still green — no new report-context publisher was added.

- [ ] **Step 4: Run `bunx next build`**

```
bunx next build
```

Expected: clean. If TS errors appear:
- "Property 'X' does not exist on ProjectDigest" → open `lib/project/digest.ts` and use the correct field name.
- "briefcaseDigest is not callable with type ProjectItem[]" → check the actual signature in `lib/briefcase/briefcase-digest.ts` and adjust.
- "describePage expected N args" → match the actual signature in `lib/chat/page-context.ts`.

Fix, re-run, repeat until clean.

- [ ] **Step 5: Commit**

```bash
git add app/project/[id]/workspace/DeliverableModal.tsx app/project/[id]/workspace/DeliverableLanes.tsx
git commit -m "feat(deliverable): wire iframe selection bridge + highlight popup into DeliverableModal"
```

---

### Task 5: Verify + push

**Files:**
- Modify: `SESSION_LOG.md`

- [ ] **Step 1: Full test suite**

```
bun test
```

Record the pass count. Expected: all pass. Confirm these specific suites are green:
- `lib/highlighter/use-iframe-selection.test.ts` — 3 pass
- `lib/highlighter/use-steer-suggestions.test.ts` — 7 pass
- `lib/briefcase/page-mount-coverage.test.ts` — unchanged count (no new publisher added)
- `lib/highlighter/converse.test.ts` — unchanged (no modifications to `converse.ts` in this layer)

- [ ] **Step 2: `bunx next build`**

```
bunx next build
```

Expected: no errors, no new TS warnings. Do not push if this fails.

- [ ] **Step 3: ESLint**

```
bun run lint 2>&1 | grep "error" | head -30
```

Expected: no new `react-hooks/set-state-in-effect` errors. The `useEffect` in `useSteerSuggestions` only calls state setters from async callbacks (inside `streamConverse` handlers), not synchronously — this is ESLint-safe.

If you see `react-hooks/exhaustive-deps` on `useSteerSuggestions`'s effect, confirm the implementation includes all ctx fields in the deps array (as written: `[enabled, span, ctx.context, ctx.projectId, ctx.pageContext, ctx.briefcase]`).

- [ ] **Step 4: Manual verification in browser**

Open the project at `/project/[id]` with at least one built deliverable.

1. Click a deliverable thumbnail → the modal opens with the iframe showing the deliverable.
2. Select any text in the deliverable narrative (click and drag).
3. Confirm: a popup appears with "Edit" and "Ask" tabs.
4. **EDIT tab:**
   - A "Suggesting steers…" spinner appears briefly.
   - 2–3 one-line steer suggestions appear as chips.
   - Click a chip → it highlights.
   - Click "Confirm & Rebuild" → spinner → the modal swaps to the new forked version (URL in the iframe changes to the new deliverable id).
   - The popup closes automatically after a successful rebuild.
5. Open a new deliverable, select text → popup appears.
6. **ASK tab:**
   - Type a question and click Ask.
   - A streaming answer appears grounded on the project (references project data / uploaded docs, not generic outside-AI answers).
   - When the answer finishes, "Rebuild with a steer →" appears.
   - Click it → switches to EDIT tab with the question pre-filled in the custom steer box.
7. Close the popup via the × button → confirm the iframe text selection clears.
8. Open the action-bar "Edit" panel (top of modal) → confirm it still works as before.
9. Navigate to a `/r/*` report page → select text → confirm the OUTSIDE highlighter popup still works as before (no regression).

- [ ] **Step 5: Write SESSION_LOG entry**

Prepend to `SESSION_LOG.md` (newest-first):

```
## YYYY-MM-DD (main) — Project Highlighter Layer 2: select-to-edit in deliverable iframe [PUSHED]

Layer 2 of the PROJECT highlighter (spec: `docs/superpowers/specs/2026-06-22-project-highlighter-phase2-design.md`).
Select text in an open deliverable's iframe → popup with EDIT (AI-proposed steers → confirm → re-fork via `/api/deliverables/[id]/edit`) and ASK (project-grounded converse). No changes to /p/*, edit route, or global use-highlight.
- New: `lib/highlighter/use-iframe-selection.ts` + tests, `lib/highlighter/use-steer-suggestions.ts` + tests, `components/highlighter/DeliverableHighlightPopup.tsx`.
- Modified: `DeliverableModal.tsx` (iframeRef + popup), `DeliverableLanes.tsx` (thread projectId).
Next: close the `project_highlighter_l2_live_verify` check after manual prod verify.
```

- [ ] **Step 6: Push**

```
node scripts/safe-push.mjs
```

---

## Self-Review

### Spec coverage

| §6.x spec claim | Task |
|---|---|
| Layer-1 `ConverseInput` fields consumed (not re-implemented) | Tasks 2, 3 |
| Option A + on-demand conversation design (§6.2) | Task 3 (EDIT primary, ASK secondary, "Rebuild with steer" CTA) |
| Selection via `contentDocument` listener (§6.3) | Task 1 |
| Rect translation: iframe coords → parent viewport (§6.3) | Task 1 `translateRect` |
| Edit executes via `POST /api/deliverables/[id]/edit { instruction }` (§6.3) | Tasks 3 + 4 (`onConfirmEdit` → `onEdit({ instruction })`) |
| Version swap wires through `DeliverableLanes.handleEdit` (§6.3) | Task 4 (`onEdit` prop calls parent's `handleEdit`) |
| Moat — never send prose (§6.3) | Tasks 3 + 4 (only `instruction` string, never narrative) |
| No `/p/*` changes (§6.3) | Confirmed — `app/p/**` untouched |
| Layer-1 first (§6.4 build-order) | Global constraints + Task 2 pre-condition |
| `page-mount-coverage.test.ts` green (§2E) | Task 5 step 1 (no new report publisher) |
| `app/project/layout.tsx` unchanged (§2E invariant #9) | Confirmed — not in file map |
| Filing: EDIT verb does NOT file (§2C F1) | Task 3 + 4: only `onConfirmEdit` called, no `fileItem` |

### Placeholder scan

None. All code blocks are complete implementations with no TBD, TODO, or "similar to above" references.

### Type consistency

| Type | Defined in | Used in |
|---|---|---|
| `IframeSelection { text, rect }` | Task 1 | Tasks 3, 4 |
| `translateRect(iframeRect, selRect): Rect` | Task 1 | (internal to hook) |
| `SteerContext` | Task 2 | Task 3 |
| `parseSteerLines(text): string[]` | Task 2 | (internal to hook) |
| `buildSteerQuestion(span): string` | Task 2 | (internal to hook) |
| `DeliverableHighlightPopup` props | Task 3 | Task 4 |
| `onConfirmEdit(instruction: string): void` | Task 3 (Props) | Task 4 (calls `onEdit({ instruction })`) |
| `DeliverableEditPatch { instruction?: string }` | existing `types.ts` | Task 4 (`{ instruction }`) |

No mismatches found.
