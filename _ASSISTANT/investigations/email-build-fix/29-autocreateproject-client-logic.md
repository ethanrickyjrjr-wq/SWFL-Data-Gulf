# Lane 29 — AutoCreateProject client-side entry logic

## Task
Read app/email-lab/AutoCreateProject.tsx in full. What exact condition causes it to
call "create new project" vs do nothing / let something resume an existing one?
Does it check localStorage/cookie/URL param/API call for "recent project"?

## File read: app/email-lab/AutoCreateProject.tsx (72 lines, full file)

Key facts:
- It's a client component ("use client"), takes props: zip, recipe, recipeNeeds,
  rkey, addr, seed, blank — ALL passed in from the parent server component. It does
  NOT read searchParams itself, no cookie read, no localStorage read.
- Single useEffect (line 35-62), gated by `firedRef` (useRef(false)) ONLY to prevent
  React strict-mode double-fire in dev — NOT a "do I already have a project" check.
- Inside the effect: ALWAYS builds a URLSearchParams from whatever props are non-null,
  and UNCONDITIONALLY does `fetch("/api/projects", { method: "POST", ... })`.
  - Body: if `addr` is set → `{ title: addr, kind: "listing", subject_address: addr }`,
    else `{}` (empty object — server presumably defaults title/kind).
  - On success: `router.replace(`${projectEmailLabBase(data.id)}${q}`)` — into the
    NEW project's email tab, carrying every query param it received.
  - On failure (fetch rejects, or `!r.ok`): `router.replace("/project")` — punts to
    the projects list page.
- There is NO condition inside this component that ever skips the create-POST. Every
  mount of this component = exactly one POST /api/projects (module-level guard just
  dedupes React double-invoke, not "check if a project already exists").
- No localStorage, no cookie, no GET/list call to check "do I have a recent project"
  anywhere in this file. Zero conditional branching on prior state.

## Where the real branch lives: the PARENT (app/email-lab/grid/page.tsx)

This file is NOT the resume-vs-create decision — it's the unconditional "make one"
action. The decision of WHETHER to render <AutoCreateProject> at all lives one level
up, in the server component `app/email-lab/grid/page.tsx` (lines 42-89):

```
const { data: { user } } = await supabase.auth.getUser();
if (user) {
  const { data } = await supabase
    .from("projects")
    .select("id, title")
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) {
    return <AutoCreateProject zip=... recipe=... .../>;   // <- ONLY this branch
  }
  // row exists: renders EmailLabGridClient with offeredProject={{id: row.id, ...}}
  // (a confirm popup asks which project — this is the "resume" path)
}
// anonymous: EmailLabGridClient, offeredProject=null
```

So the exact condition triggering "create" is: **signed-in user AND zero rows in
`projects` table for that user** (an authenticated Supabase query, `order by
updated_at desc limit 1`, checked server-side on every page load of /email-lab/grid).
It is a live DB query each request — not cached, not localStorage, not cookie-based.
If the user already has ANY project (even one from months ago), row is truthy and
AutoCreateProject is never rendered; instead EmailLabGridClient gets
`offeredProject={{id: row.id, title: row.title}}` and (per the comment on lines 12-18)
shows a "project-confirm popup" asking whether to resume that project or start a new
one — that popup logic lives in EmailLabGridClient, NOT in AutoCreateProject or this
page.

## Ruled out
- No localStorage/sessionStorage access anywhere in AutoCreateProject.tsx.
- No cookie read in AutoCreateProject.tsx (cookies() is only used in the parent
  page.tsx to build the Supabase server client for auth).
- No URL param drives "skip create" — the only params (zip/recipe/rkey/addr/seed/
  blank) are pass-through payload for the new project's redirect, not gates.
- The `firedRef` guard is a React strict-mode artifact (mount/unmount/remount in
  dev), documented inline at line 33: "strict-mode double-fire would create two
  projects" — it is NOT a resume-vs-create signal, just idempotency-within-one-
  component-lifetime.

## Relation to tonight's incident (per prompt: "root of tonight's incident, needs
its own answer" — referring to AutoCreateProject.tsx broadly)
This component itself does not appear to be the corruption vector by its own logic —
it's a single unconditional "create blank project, redirect" action gated entirely by
the parent's `!row` check. The risk surface is upstream: whether `app/email-lab/page.tsx`
(the non-grid entry, NOT read in this lane) or any other caller ALSO renders
AutoCreateProject under a condition where the user actually already had unsaved work
in-flight (e.g., a race between two tabs, or the `/email-lab` vs `/email-lab/grid`
paths both independently querying `projects` and disagreeing). That cross-file
comparison is out of this lane's scope (lane 04 covers server/API resume-vs-create).

## Finding handed back
- File: app/email-lab/AutoCreateProject.tsx — has ZERO internal gating logic; it is
  an unconditional "POST /api/projects then redirect" effect. The actual
  create-vs-resume decision is 100% in the caller: app/email-lab/grid/page.tsx lines
  47-68, based on a live `select id,title from projects order by updated_at desc
  limit 1` per signed-in request. No localStorage/cookie participate in this
  particular decision at all — the state authority is the Supabase `projects` table
  itself, read fresh on every navigation to /email-lab/grid.
