## Task 4: Confirm (don't rebuild) caption provenance

**Goal:** A confirmation pass, not a build. REVIEW A5 found captions are ALREADY cited — `build-week.ts` runs the four-lane prompt, reuses `refreshStaleLakeContext`, and `webSources` ride back on `WeeklyCalendar`. This task PROVES that holds and adds a regression test so it can't silently rot. The moat: if a caption states a figure, it names a source; an invented number is the only hard block.

**Parallel-safe:** read + test only. No shell conflict.

**Files:**
- Read (audit): `lib/email/social-calendar/build-week.ts`, `app/api/email-lab/social-calendar/route.ts`, `lib/email/social-calendar/themes.ts`.
- Create: `lib/email/social-calendar/__tests__/provenance.test.ts` — the regression guard.

**Interfaces:**
- Consumes: `buildWeek` output `WeeklyCalendar` (`webSources`, per-post captions); the four-lane prompt constant in `build-week.ts`.
- Produces: a test asserting the no-invention contract + a one-paragraph audit note appended to this file's "Findings".

- [ ] **Step 1** — Trace one path: route → `buildWeek` → per-post caption. Confirm every figure-bearing caption traces to (a) a lake value via `refreshStaleLakeContext`, (b) an upload, (c) a `webSources` entry, or (d) is gated `[Need: …]`. Record the exact prompt lines that enforce it.
- [ ] **Step 2: Failing test** — feed `buildWeek` a mocked lake context with NO value for a metric; assert the generated caption does NOT contain a fabricated number for it (it either omits the stat or emits `[Need: …]`). Mirror `build-week.test.ts`'s Anthropic mock.
- [ ] **Step 3** — If the test passes immediately, the moat holds → record "VERIFIED" in Findings. If it fails, that's a real leak → file a check and fix `build-week.ts` (escalates this task from audit to fix).
- [ ] **Step 4: Run** (`bun test lib/email/social-calendar/__tests__/provenance.test.ts`).
- [ ] **Step 5: Commit** — `test(social-calendar): regression guard for four-lane caption provenance`.

### Findings
_(fill at execution — VERIFIED vs leak, with the exact enforcing prompt lines quoted)_
