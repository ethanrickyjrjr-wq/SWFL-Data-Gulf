# Mobile pill collapse + address-leak routing + markdown strip

**Date:** 2026-07-05
**Check:** `mobile_pill_address_leak_live_verify`
**Related:** `2026-07-05-agent-first-homepage-design.md` (build 1 shipped; this is the fast-follow defect build caught by the operator's phone screenshots). Address spine (build 2) is separate and next — this build must not duplicate its mechanism.

## Problem

Three live defects, all visible in the operator's 07/05/2026 production screenshots:

1. **Phone pill sheet is inescapable.** The AI + Briefcase pill auto-opens for every first-time visitor and its sheet covers most of a phone viewport. Worse: the open sheet (`z-[57]`, `inset-x-0 bottom-0`) renders on top of the Close pill (`z-[56]`) and `BriefcasePanel` has no close control of its own — a first-time phone visitor has no visible way to dismiss it. Research (crawl4ai 07/05/2026, nngroup.com/articles/popups/ + /overuse-of-overlays/): never show an overlay before the user gets value from the page, never block content access on mobile, always provide a visible close.
2. **Address typed into a chat surface gets a region-grain essay.** The comp helper (the live address→comps engine) only fires on comp/value keywords; a bare address falls through to the generic converse path, which answers with SWFL-wide medians — exactly what the agent-first identity says must never happen. Leak surfaces: map-section search (text → /ask), the /ask page itself, and the standalone pill chat.
3. **Raw markdown ships to users.** `components/answer/AnswerText.tsx` (the one shared answer renderer) is plain-text by design, so when the model emits `**Housing Market**` the asterisks render literally.

## Goal

Phone visitors always see the site; the pill is an opt-in tool with a visible close. An address typed anywhere public routes into the campaign-build flow (one front door, same URL the hero builds). Markdown can never render raw, even when the model disobeys.

## What we're building

1. **Pill (`lib/briefcase/pill-mount.ts` + `components/briefcase/AiBriefcasePill.tsx`)**
   - `shouldAutoOpenPill` gains `phone: boolean` — phone never auto-opens; desktop funnel pop unchanged. Read via `matchMedia("(max-width: 639px)")` at the existing auth-resolved decision point (client-only by construction).
   - Standalone sheet gets a sticky header row: title + X close (`setOpen(false)`) + Escape-to-close. Fixes the buried-close bug on every device.
   - Phone sheet cap 60vh → 55vh. Desktop popover untouched.
2. **Address routing shim (one root, aligned with the ladder)**
   - `isBareAddressQuery(text)` — a NEW strict predicate (house-number start + street-suffix/comma/ZIP shape, no question/comp/value words), deliberately NOT shared with the comp helper: its `ADDRESS_HINT` is a permissive span-hint gated by keywords and would hijack questions like "3 bedroom homes in 33904" if reused for routing. `comp-helper.ts` is untouched — questions containing an address still flow to the chat engine (comp helper included); only a bare address lookup routes to the build flow.
   - Wired into `/ask` (both the manual submit AND the auto-submitted `?q=` — which transitively covers the map-section search, whose non-ZIP submits land there; `Hero.tsx` itself untouched, it was claimed by a parallel session and doesn't need edits) and the standalone pill chat submit (public pages only — inside a project the assistant keeps its comp/saved-address flows untouched). Address detected → resolve via the existing `/api/address-suggest`/`retrieve` proxies → navigate to `heroDestination(new-listing)` — the exact grid-lab URL the hero builds. Resolution failure → fall through to today's behavior (empty-tolerant, no error states).
   - **Out of scope:** the project workspace assistant (comp helper, saved-address flows) — untouched. The bridged /r/* report dock — untouched.
3. **Markdown strip (`components/answer/AnswerText.tsx`)**
   - Preprocess before tokenizing: `**bold**`/`__bold__` → bare text, leading `#`+ headers → bare text, leading `* `/`- ` bullets → bare text. One root fixes every answer surface.

## Success criteria

- bun:test green on the pure pieces (`shouldAutoOpenPill` phone flag, `looksLikeAddress`, markdown strip); existing comp-helper tests byte-identical green.
- `bunx next build` green.
- Phone: first visit shows the full homepage with only the small pill; open sheet shows a working close.
- Address typed into map search / /ask / pill chat lands in the email lab prebuilt, never a region-grain answer.
- `mobile_pill_address_leak_live_verify` closed by the operator on prod.
