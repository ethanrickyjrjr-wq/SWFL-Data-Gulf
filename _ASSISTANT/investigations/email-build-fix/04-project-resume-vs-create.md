# Lane 04 — Does /email-lab create a NEW project or resume an existing one?

## Verdict: RESUMES the single most-recently-updated existing project by default.
A signed-in user opening /email-lab has their AI build targeted at whichever
project was `updated_at` most recently — with no filter for empty/untitled/isolated.
A real, unrelated, 4-week-old project that happened to be most-recently-updated
becomes the silent build target. New-project creation ONLY fires when the user
has ZERO projects.

## The trace (signed-in visit)

1. `app/email-lab/page.tsx:28-30` — signed-in → `redirect(signedInLabArrival(...))`
   → `/email-lab/grid` (NO project id). destination.ts comment (lines 11-13, 83-95)
   is explicit: the old `projects[0]` auto-pick was DELETED; "the arrival controller
   asks which project once there."

2. **ROOT CAUSE — `app/email-lab/grid/page.tsx:47-53`:**
   ```ts
   if (user) {
     const { data } = await supabase
       .from("projects")
       .select("id, title")
       .order("updated_at", { ascending: false })
       .limit(1);
     const row = (...)?.[0];
   ```
   For ANY signed-in visitor, the standalone lab selects the single
   most-recently-updated project and passes it as `offeredProject`
   (line 86: `offeredProject={{ id: row.id, title: ... }}`).
   - No filter for "untitled" / "empty" / "no items" / "no deliverables".
   - `updated_at desc limit 1` = literally the last project the user touched.
   - Only if `!row` (zero projects) does it render `<AutoCreateProject>` (line 54-67),
     the ONLY path that creates a fresh isolated project.

3. `app/email-lab/grid/EmailLabGridClient.tsx` — the offered project is the default
   build target:
   - `intoProject(offeredProject!.id)` (line 164-186) hard-navigates to
     `/project/{most-recent-id}/email-lab` carrying the recipe.
   - `createAndEnter` (line 188-207) is the only NEW-project branch, reached
     solely via the confirm popup's "No — new project".

4. The build lands in-project (`app/project/[id]/email-lab/page.tsx`) and its client
   (`ProjectEmailLabClient.tsx`) MUTATES that project:
   - `bankPopupBrand` → `PATCH /api/projects/{id}` body `{ branding }` (line 235-239)
   - materials PATCH `/api/projects/{id}/materials` (line 437, 471)
   - project PATCH for name/scope (line 316-325, 417)
   - silent debounced **autosave** of the doc (line 242-254, `useAutosave`)
   → the resumed 4-week-old project's branding/materials/deliverable get overwritten.

## The guard — and why it failed (the regression)

The intended safety was a BLOCKING `ProjectConfirmPopup` ("Build this in <project>?
/ No — new project"). spec 2026-07-06 deleted the projects[0] auto-pick precisely to
stop silent overwrite, replacing it with this blocking ask.

But spec 2026-07-15 (gallery-listing-hero) WEAKENED it for the default plain open:
- `EmailLabGridClient.tsx:78-96` — a signed-in PLAIN open (no recipe/zip/seed/did)
  gets `firstRunGalleryEligible: signedIn` → `planArrival` returns
  `doc.kind === "gallery"` (arrival.ts:137-138) → `showGallery = true`.
- `EmailLabGridClient.tsx:135-137`:
  ```ts
  const [confirmOpen, setConfirmOpen] = useState(
    showGallery ? false : plan.projectConfirm || signedInSeedHop,
  );
  ```
  In gallery mode the BLOCKING confirm is suppressed (`false`).
- Instead the target is shown as a small gray passive line (line 262-273):
  `Building into: <most-recent project title>  [Change]`.
- Picking any template (`onPick` line 275) or Start-blank (line 277-282) routes
  DIRECTLY into `targetProject.id` (= most-recent project) with NO confirm.
  From there the AI panel build overwrites that project.

So: the recipe-param arrival still shows the blocking popup (projectConfirm=true), but
the DEFAULT signed-in plain open shows only a dismissible/ignorable "Building into /
Change" line pointing at the user's last-touched real project. A user who doesn't
notice the tiny top-right line silently builds over their existing work.

## Is "reuse most-recent" intentional? No — it's a half-reverted design.

- Intent per spec 2026-07-06: NEVER auto-pick; ALWAYS ask (blocking). The projects[0]
  pick was called out as the bug.
- grid/page.tsx STILL auto-picks (just `updated_at desc limit 1` instead of `[0]`),
  and the 2026-07-15 gallery path turned the blocking ask back into a passive line.
  Net effect = the exact silent-overwrite behavior the 07-06 spec removed.

## Fix (concrete)

Primary: `app/email-lab/grid/page.tsx:47-53` + `EmailLabGridClient.tsx:135-137`.
1. Default the standalone signed-in lab to a NEW isolated project (or NO pre-selected
   target). Reuse of an existing project must be an explicit, opt-in choice — never
   the default build target.
2. If an existing project is offered at all, restore a BLOCKING confirm before the
   FIRST write in the gallery path too — do not let `onPick`/`onStartBlank`/the AI
   build write into `offeredProject` until the user has explicitly confirmed that
   target. Remove the `showGallery ? false` suppression, or gate the template-pick /
   build navigation behind an explicit confirm.
3. Optional hardening: only offer reuse candidates that are demonstrably empty
   (no deliverables, no items) so a real in-progress project is never a silent target.
4. Deeper safety net (out of lane but worth flagging): in-project builds PATCH/autosave
   over the existing row with no undo — a new build should create a NEW deliverable
   draft, not overwrite the project's saved doc/branding in place.

Root cause file:line = `app/email-lab/grid/page.tsx:48-53` (auto-select most-recent),
compounded by `app/email-lab/grid/EmailLabGridClient.tsx:135-137` (blocking confirm
suppressed in the default gallery path).
