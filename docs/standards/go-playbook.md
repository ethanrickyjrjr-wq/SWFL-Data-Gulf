# /go PLAYBOOK — the standalone one-click site

**Started 08/11/2026 by operator decree:** *"Start playbook for /go site. We are pretending it's not
swfldatagulf. Basically going to be a new stand alone site."*

**ONE FILE.** Same precedent as `docs/standards/email-build-playbook.md` (decree 08/04/2026 —
*"stop fucking reading 6 documents"*). This file covers the **site**: identity, chrome, what the lab
lane is allowed to carry, and the add/delete/change contract. It does **not** restate email
internals — those live in the email playbook and this file points at it. Restating them here creates
the seventh document.

**CONFLICT ORDER:** code root > this playbook > everything else. Where this file disagrees with
`docs/superpowers/plans/2026-08-10-go-one-click-apify-handoff.md`, the handoff wins on *scope* (it
is the operator's verbatim ceiling) and this file wins on *site shape* (which the handoff never
covered).

**STATUS MARKERS.** Every section is **DECIDED** (operator has ruled), **DRAFTED** (proposed here,
needs sign-off), or **OPEN** (a real question with no answer). Do not treat a heading as covered
because it exists.

---

## PART 0 — WHAT /go IS

**STATUS: DECIDED.**

A standalone product that happens to live in this repo today and moves to its own domain later. A
visitor types an address, picks one of the lifecycle emails, and lands in a working email lab with
that email built. That is the whole product.

The three properties that define it, in priority order:

1. **No company identity.** Nothing on any /go surface says who built it (PART 1).
2. **Simplicity is a CEILING, not a target.** The handoff's words: *"The spec is a CEILING. If a fix
   seems to need UI, ask first."* Adding copy, a second link, a tagline, or a footer is a defect,
   not polish. Two logged copy-creep rages sit in `components/go/GoTopBar.tsx:15-17`.
3. **A user can add, delete, and change without getting lost** (PART 4).

What exists today, verified 08/11/2026 by reading the tree:

- `app/go/page.tsx` — the page. Chrome-free, white, Montserrat display + Lato body.
- `components/go/GoTopBar.tsx` — two elements only: **My Brand**, **Sign up**. No logo.
- `components/go/OneClickHero.tsx` — one bar, one **New Listing ▾** button, 7 lifecycle options
  plus Listings Digest. Address autocomplete rides `/api/address-suggest` + `/api/address-retrieve`.
- Picking an option navigates through `heroDestination` (re-exported from
  `lib/lab-entry/destination.ts`, the ONE root for lab URLs) to
  `/email-lab/grid?recipe=…&rkey=…&addr=…`.

---

## PART 1 — THE IDENTITY LAW

**STATUS: DECIDED (the rule). The enforcement is DRAFTED — see the gap.**

**Operator, 08/11/2026:** *"Don't need logos and name except on emails without Brand saved."*

Split by artifact. This supersedes the 08/10 blanket strip and is narrower than the 08/11 top-bar
note it replaces:

- **Every /go surface — the page, the bar, the lab, any popup:** no logo, no company name, in any
  form, including alt text. Ever.
- **A rendered email whose sender has NO brand saved:** the house identity ships — that is the
  fallback that makes an unbranded email legal (sender identity, CAN-SPAM footer). This is already
  how the code behaves: `applyBrand` (`lib/email/brand/apply-brand.ts:25`) is a no-op passthrough on
  a nullish token map, and `lib/email/doc/default-docs.ts:36` carries `companyName: "SWFL Data
  Gulf"` as the house default. **A saved brand overlays it, and a real company name deletes the
  house logo pixels** (`apply-brand.ts:34-37`) so we never ship our imagery under a client's name.
- **A rendered email whose sender HAS a brand saved:** their name, their logo, their colors. Ours
  appears nowhere in the branded chrome.

### WHY THE ONE LAB ALREADY HAS NO LOGO — nothing was changed for /go

There is exactly ONE email lab (`/email-lab/grid`), and it has carried no site header, no logo and
no wordmark **since 06/29/2026** — commit `7890fd20`, *"grid shell visual pass — light theme,
black/orange bar, orange headers, nav-stripped"*, six weeks before /go existed. `/go` was added to
that same `CHROME_FREE_PREFIXES` list on 08/10/2026 (`8120baf6`), joining a lab that was already
stripped.

The logo lives in the global site header (`SiteShell`), which returns null on any chrome-free path.
So the lab is logo-free **for every user on every lane**, not just /go — that is the pre-existing
state of the swfldatagulf lab, not something built for the white-label story. The white-label work
that remains is real but narrower than it sounds: the wordmark inside generated prose and citations
(below), the three adjacent surfaces that still carry it, and the guard's reach.

### THE GAP — the guard stops at a folder boundary

`components/go/go-identity.test.ts` is a real, well-built guard: three tests named after their
failure modes (banned wordmark, no image of any kind, no copy creep past the two button labels).
**But `DIR = import.meta.dir` — it only ever reads `components/go/*`.** The moment a visitor clicks
an option they are in `/email-lab/grid`, which the guard has never inspected.

Measured 08/11/2026 (`grep` over the lab lane): the core lab components are clean — no wordmark in
`components/email-lab/`, `components/brand/`, `components/lab-entry/`, `LoginModal`, or
`SendCeilingMeter`. Three surfaces adjacent to the lane are **not** clean and must never be reachable
from /go without a strip: `components/email-lab/social/BlueskyPostBar.tsx`,
`app/project/page.tsx`, `app/project/[id]/page.tsx`,
`app/project/[id]/workspace/ConnectMcpBlock.tsx`, `app/project/_cockpit/CampaignDrawer.tsx`.

Two more identity leaks that are **not** UI and would survive any component-level guard:

- **LLM system prompts name us.** `lib/email/author-doc.ts:368` and `lib/email/build-doc.ts:467`
  both open with *"You are … for SWFL Data Gulf, a Southwest Florida real estate…"*. That is inside
  the generator, so it can surface in generated prose on a white-label email.
- **Data citations name us on purpose.** `lib/email/address-context.ts:13`,
  `lib/email/market-context.ts` (four call sites), `lib/email/doc/preview-fill.ts`. This is a
  **locked** rule — listing citations say SWFL Data Gulf — and it directly collides with the
  white-label rule above. See PART 6, open decision 1. Do not "fix" it either direction unilaterally.

**The mechanism this section owes:** extend the identity guard past `components/go/` to cover every
component reachable on the /go lane, and add the prompt strings to what it scans. A rule in a doc is
not a rule — that sentence is already written in the guard's own header.

---

## PART 2 — CHROME AND ROUTES

**STATUS: DECIDED.**

Two lists govern what disappears. Both are already correct for /go — do not reach into them to "let
a header through," which drags the whole site nav back onto the page.

- `components/nav/nav-config.ts:144` — `CHROME_FREE_PREFIXES = ["/email-lab/grid", "/go"]`. Drops
  SiteShell + SiteFooter.
- `lib/briefcase/pill-mount.ts:34` — `AI_CHROME_FREE_PREFIXES = ["/for-agents", "/email-lab", "/go"]`.
  Drops the AI pill / highlighter.

**Both /go AND the grid lab are already chrome-free — and the lists are live, not declared-dark.**
Verified 08/11/2026: `components/nav/SiteShell.tsx:82` and `components/nav/SiteFooter.tsx:59` both
call `isChromeFree(pathname)` and return null; `lib/briefcase/pill-mount.ts:38` does the same for
the AI pill. Three real consumers, no orphaned list. The standalone site is, on the chrome axis,
already standing.

There is **no `(bare)` route group and no `bare` layout** in this repo — searched 08/11/2026. The
chrome-free prefix lists ARE the bare-render mechanism, and they already cover both surfaces. If a
named `(bare)` group is wanted later it would be a rename of a working mechanism, not a new
capability.

`lib/lab-entry/destination.static.test.ts` fails the suite if a raw `/email-lab` navigation string
appears outside `lib/lab-entry/`. Every new door builds its URL there.

### Theme — DECIDED 08/11/2026

**Operator:** *"Can use our colors for all of the site."*

One palette across /go and the lab. Our colors, everywhere. The split that would have made this read
as two products — /go white with Montserrat + Lato (`app/go/page.tsx:12-17`, `components/go/brand.ts`)
handing off to the lab's `--gulf-midnight` / `gulf-teal` / `bg-[#0a1419]` — is closed by ruling, not
by a lane flag. **Colors are not identity: our palette is fine everywhere, our logo and name are
not** (PART 1 is unchanged by this).

That removes a consumer from PART 5's lane flag. Remaining lane consumers: the capability dial, the
gallery line, the rail.

---

## PART 3 — THE LAB, LAB-ONLY

**STATUS: DRAFTED.** Operator: *"Even email lab is just email and design tools with address as
projects on the left… No demos or choices on different designs."*

### What stays (this IS the product — never kill it)

The grid canvas and its design tools. `components/email-lab/GridCanvas.tsx`, `BlockInspector`,
`AddBlockPanel`, `PhotosPanel`, `MediaPanel`, the brand panel, the build box. The grid builder is
the crown jewel; nothing in this playbook narrows it.

### What comes off the /go lane

- **The design-choice gallery.** `TemplateGallery` renders on plain open because
  `app/email-lab/grid/EmailLabGridClient.tsx:117` passes `firstRunGalleryEligible: signedIn`, and
  `lib/lab-entry/arrival.ts:170` returns `{kind:"gallery"}` off that flag. On the /go lane it is
  always blank. **One line.**
- **Social mode entirely** — `SocialComposer`, `SocialElementInspector`, `SocialCalendarPanel`,
  `ScheduleSocialModal`, the Bluesky bar (which also carries the wordmark).
- **Datasets / data-bound blocks** — `DatasetBrowser`, `DatasetChip`. This is the lake surface, and
  /go is explicitly a no-lake product (see the carve-out plan's positioning section).
- **The contact picker and schedule-send** — those are the send half, not the lab half. Out until
  the operator routes them in deliberately.

### How it gets done — through the dial, never around it

`lib/email/lab/capabilities.ts` is the ONE tier dial (`free | paid`), and `capabilities.test.ts`
enforces that every feature declares a target. **It has no lane axis today.** The work is adding one
— a third tier value or a second axis — so each feature declares where it appears on /go too.

**Do NOT add ad-hoc `if (isGo)` branches.** That file already documents its own drift in a comment:
the `socialCalendar` wiring is currently backwards versus the dial. That is exactly what happens
when reality bypasses the dial, and it is the shape `decree-in-prose-code-never-walked-it` is at
three strikes for.

---

## PART 4 — ADDRESSES ARE PROJECTS: THE ADD / DELETE / CHANGE CONTRACT

**STATUS: DRAFTED.** This is the "without getting lost" half, and it is where the current code most
directly contradicts a standing decree.

**The law, already in the arrival controller** (`lib/lab-entry/arrival.ts:140`, operator screenshot
08/11/2026 10:45): *"whenever you have to put in an address or choose, no new project, it fucks
everything up… the project name is the address and once put in, whatever build you had chosen will
start building."*

So: **the address IS the project.** Title, `kind: listing`, `subject_address` — one identity. The
arrival already honors this via `addressFirst`, which suppresses the project-confirm popup when an
address-subject recipe carries an address.

### The contradiction to fix

`app/project/ProjectsRail.tsx:34-48` — `handleCreate` POSTs `{ title: "Untitled project" }` on
**+ New**. That mints exactly the untitled row the decree bans. On the /go lane, **+ New must take
an address and nothing else**; there is no such thing as an untitled project here.

Second mismatch: rail rows link via `projectEntry(p.id, p.lastDid)` → the project home. On a
lab-only site there is no project home — a row opens that address's email in the lab.

### The contract

- **ADD** — type an address. That creates the project, named by the address. No other add path, no
  untitled row, no confirm popup.
- **CHANGE** — pick a row; the lab loads that address's email. Switching rows never asks which
  project. Re-typing an address that already exists routes into it instead of creating a twin
  (`lib/lab-entry/address-reconcile.ts` is the existing root for that match).
- **DELETE** — the row's own named confirm, already built:
  `app/project/_cockpit/ConfirmDeleteProject.tsx`, reached from the rail's `⋯`. Keep it; it names
  the project in the prompt, which is what stops the wrong-row delete.

---

## PART 5 — DO WE BUILD /go/email-lab?

**STATUS: DECIDED — NO. Build a LANE, not a route.**

The evidence, all verified 08/11/2026:

- `/email-lab/grid` is **already** chrome-free (`nav-config.ts:144`), so a new route buys no chrome
  isolation — the thing a second route is usually for.
- `destination.static.test.ts` fails the build on any raw `/email-lab` nav string outside
  `lib/lab-entry/`. The repo actively punishes a second lab route, by design.
- The lab is 2,722 lines in one shell plus ~25 sibling components. A second route either imports all
  of it (a route with no behavior change — pure cost) or forks it (two labs drifting apart, which is
  the exact disease `retire-block-shell` was run to cure in July).

**What /go actually needs is not a route — it is a lane flag** that reaches the dial (PART 3), the
gallery line (PART 3), the palette (PART 2), and the rail (PART 4). One flag, four consumers, no
duplicated surface.

**The one thing that could overturn this**, and it is now checked: the identity guard's reach. If
the "no company identity" guarantee died at the /go page boundary, minting a guarded route would be
defensible. It is measured in PART 1 — the lane is clean today, the guard just doesn't cover it. The
answer is to extend the guard, not to mint a route.

---

## PART 6 — FAILURE MODES AND THE GUARD FOR EACH

**Required by RULE 3.5** — no design ships without this section, and a hand-waved one does not get
approved.

1. **Identity creeps back onto a /go surface.** Happened three times already per the guard's own
   header. → Extend `go-identity.test.ts` past `components/go/` to every component on the /go lane,
   plus the two LLM prompt strings.
2. **A feature leaks onto the /go lane because someone added it without routing it.** → The lane
   axis goes in `capabilities.ts` so `capabilities.test.ts` forces a declaration. Nothing ships
   where you didn't send it.
3. **The lane flag gets read as an ad-hoc `if (isGo)` in the shell.** → A lint/test that fails on
   any `isGo`-shaped conditional outside the dial. Without this, failure mode 2's guard is bypassable.
4. **+ New mints an untitled project.** Live defect today. → The rail's create path requires an
   address on the /go lane; a test named for the decree.
5. **A re-typed address creates a duplicate project.** → Route through `address-reconcile`; test the
   match, not just the create.
6. **The palette splits and /go reads as two products.** → Palette rides the same lane flag; a
   visual check on the handoff boundary, since a unit test cannot see this one.
7. **A white-label email still says who built it, through a citation or generated prose.** → Open
   decision 1 below must be answered before this can be guarded at all.

---

## PART 7 — OPEN DECISIONS (operator)

1. **Citations vs white-label.** Listing citations saying SWFL Data Gulf is a locked rule; a
   white-label email naming us contradicts PART 1. Options: keep our name only in the source line
   (provenance, arguably not branding); rename the citation to a neutral data-source label; or drop
   the citation on the /go lane and lose the four-lane provenance signal. **This blocks failure
   mode 7's guard.**
2. **Send.** The lab builds. Does the /go lane also send, or hand off to sign-in? PART 3 currently
   parks the contact picker and schedule-send as out; that is a placeholder, not a ruling.
3. **Sign-in.** The bar carries **Sign up**, so accounts exist here. What does a signed-out visitor
   lose — save, send, or nothing?
4. **Domain and timing.** "Moves to its own domain later" is in the handoff. Same repo with a lane
   flag until then, or a real carve-out per `docs/carve-out/EMAIL-BUILDER-CARVE-OUT.md` (which is a
   fuller no-lake product plan and should be read before any repo split).

---

## WHAT THIS FILE DOES NOT COVER

- **Email internals** — type scale, 8px grid, 600px canvas, body word counts, chart policy,
  Outlook/dark-mode/102KB, CAN-SPAM. All in `docs/standards/email-build-playbook.md`. Never
  duplicated here.
- **The no-lake product plan** — `docs/carve-out/EMAIL-BUILDER-CARVE-OUT.md` (positioning, day-0
  guards, repo shape, kill list).
- **Harness/process guards for a new repo** — `docs/standards/new-project-playbook.md`.
- **The Apify fill lane** — `docs/superpowers/plans/2026-08-10-go-one-click-apify-handoff.md` plus
  the email playbook's actor inventory.
