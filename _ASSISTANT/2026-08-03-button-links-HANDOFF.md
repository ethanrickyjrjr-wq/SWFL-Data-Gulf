# HANDOFF — button links: agent-owned destinations, saved in brand

**For:** an Opus session picking this up cold. **Written:** 08/03/2026.
**Read first:** `docs/standards/emails.md` §0.1c + §0.1d (the rules this implements),
`lib/email/CLAUDE.md`, `lib/deliverable/CLAUDE.md`.
**Checks this closes:** `brand_per_link_destination_overrides`.
**Check it must NOT pretend to close:** `applybrand_no_server_side_caller` (see §6 — it will
silently defeat this entire feature on non-Lab sends).

---

## 1. THE DECREE (verbatim — do not paraphrase into something easier)

08/03/2026, operator:

> *"the agent can change all links and should be able to save that in their brand. We don't want
> anyone coming to our site unless they need to or we are activly marketing to"*

> *"write a handoff for opus to take care of button links. Make sure user gets a pop up for filling
> in buttons unless they are already saved in their brand file. Any button going to us that is built
> by a user with a brand needs a fail-confirm you want this to go to swfldatagulf.com or change and
> save. If a user changes the name of a button, the saved website follows it. Easily updated by
> double clicking a button or in brand. all new listings will have new landing addresses, so that
> button will have to change a lot, we make a CTA button that rides with each new listing that can
> be changed same ways as others"*

**The posture underneath it:** we are white-label infrastructure the agent puts their name on, NOT a
traffic destination. A click that lands on `swfldatagulf.com` from a client's send is a leak that
competes with the person we sell to. Our page is the FALLBACK, never the preference.

---

## 2. WHAT THE CODE DOES TODAY (probed 08/03/2026 — verify, don't trust these line numbers)

- **`ButtonProps` is `{ label?, url?, bgColor? }`** — `lib/email/doc/schema.ts:273-277`
  (`ButtonPropsSchema`). **There is NO stable identity on a button.** No role, no key, no id that
  survives a re-build. This is the single biggest blocker and §3 is mostly about fixing it.
- **Brand → tokens:** `lib/email/brand/branding-to-tokens.ts:83-86` maps `website_url` to BOTH
  `WEBSITE_URL` and `CTA_URL`. The social/URL block above it (`SOCIAL_TOKENS`) is the pattern to
  copy for new URL fields — straight pass-through to an UPPER token.
- **The overlay already states the principle** — `lib/email/brand/apply-brand.ts`, button branch:
  *"Brand owns ordinary link destinations — but an engine-set reply CTA (mailto:, agent-launch L2)
  survives the overlay."* Implementation: `if (cta && !props.url.startsWith("mailto:")) props.url = cta`.
- **THE GAP:** that is ONE GLOBAL override. Every ordinary button in a doc is rewritten to the same
  `website_url`. An agent cannot give the community button one destination and a booking button
  another — and a community button pointed at our page is silently clobbered to their homepage the
  moment they save a website. Right direction, wrong granularity.
- **Buttons are emitted by at least 6 recipes** — `agent-brand-intro.ts`, `community-info.ts`,
  `listings-showcase.ts` (×2), `review-reply.ts`, `sphere-weekly.ts`. Grep `type: "button"` for the
  live list before you start; it will have grown.
- **Inline editing exists** — `EditableText` / `EditScope` in `lib/email/blocks/editable-text.ts`,
  consumed by `ButtonBlock.tsx`. The double-click affordance should extend this, not invent a
  second editing system.
- **Brand editing surfaces:** `components/brand/BrandingBlock.tsx` (the field form) and
  `components/account/AccountBrandEditor.tsx`. Brand persists to `projects.branding` /
  `user_brand_profiles`. Both the project page and the lab's live panel call
  `brandingToTokens` — one mapping, no fork. Keep it that way.

---

## 3. WHAT TO BUILD — six behaviors, all from the decree

### 3.1 Button identity — the prerequisite for everything else
Add a stable **`role`** (or `key`) to `ButtonProps` and to `ButtonPropsSchema`. Suggested roster,
confirm against live recipes: `primary-cta` · `community` · `listing` · `booking` · `unsubscribe`
· `custom:<slug>`. Every recipe that emits a button must declare one — make it REQUIRED so a new
button cannot ship without a role (the `FontFamily`-as-keyed-`Record` trick in
`lib/email/lab/capabilities.ts` is the established pattern for "adding a thing forces you to route
it"). Backfill every existing emitter in the same commit (atomic type-lift, Brain Factory rule 3).

### 3.2 Per-link destinations saved in brand
Replace the single `website_url`-drives-everything override with a **destination map keyed by
role**, saved in the brand blob. `website_url` stays as the default for `primary-cta` so nothing
regresses. Resolution order for any button, at render:
1. The doc's own authored `url` if the user set it explicitly on this build.
2. The agent's saved destination for that ROLE, from brand.
3. `website_url` (brand) where the role has no specific saved value and the role is a generic CTA.
4. **Our page — last, and only as fallback** (e.g. `/r/communities-swfl/[community]`).
5. Nothing → the button does not render with a dead/house URL; treat as an OPEN SLOT and prompt.

### 3.3 The fill-in popup
On build/open in the lab, **any button whose destination is not already saved in brand prompts the
user to fill it in.** If brand already has a saved destination for that role, **no prompt** — that
is the whole point of saving. The prompt must offer "save to brand" inline, not send the user to a
separate settings page.

### 3.4 The swfldatagulf.com fail-confirm
**Any button resolving to a `swfldatagulf.com` URL, in a doc built by a user who HAS a brand, must
raise a confirm before it can ship:** *"This button sends your readers to swfldatagulf.com — is that
what you want, or do you want to change it and save?"* with a change-and-save path in the dialog.
- Scope it correctly: **only when the user has a brand.** Our own house sends and brandless
  previews must not nag.
- This is a CONFIRM, not a block — the agent is allowed to choose our page (§0.1d permits it when
  they deliberately choose it). Never silently rewrite their link either direction.

### 3.5 Rename carries the destination
**"If a user changes the name of a button, the saved website follows it."** With §3.1's role in
place, the destination binds to the ROLE, so relabeling "Find Out More" → "See the Neighborhood"
keeps the saved URL attached. Editing is available two ways, both required:
- **Double-click the button** in the canvas → edit label and destination together, with save-to-brand.
- **In brand** → the same destinations listed and editable in `BrandingBlock`.

⚠️ **AMBIGUITY TO RESOLVE WITH THE OPERATOR BEFORE CODING THIS ONE.** "The saved website follows it"
reads two ways: (a) the URL stays bound through a rename — role-keyed, what §3.1 gives you; or (b)
destinations are keyed by button NAME, so renaming re-points the button at whatever is saved under
the new name. (a) is the sane engineering answer and the rest of this handoff assumes it. **Ask.
Do not guess and ship.**

### 3.6 The per-listing CTA button
**"all new listings will have new landing addresses, so that button will have to change a lot, we
make a CTA button that rides with each new listing that can be changed same ways as others."**
- Role `listing`. Its destination is **per-listing**, not one saved brand value — it travels with
  the listing record and changes every time a new listing lands.
- It must be editable **the same two ways** as every other button (double-click, and in brand for
  its default/pattern) — the decree says "same ways as others," so do not build a bespoke editor.
- Sensible default when the agent has not set one: their saved listing-landing pattern if we
  support one, else the listing's own landing address, else OPEN SLOT + prompt (§3.3). **Never
  default it to our site.**
- Check `lib/listings/` for what listing URL/permalink we actually hold before designing the
  default — do not assume a field exists.

---

## 4. NAME THE BREAK BEFORE YOU BUILD (RULE 3.5 — required before approval)

| Failure mode | Guard |
|---|---|
| A recipe ships a button with no `role` → falls back to the global override again | Required field in `ButtonPropsSchema`; type-lift makes omission a compile error; a test asserts every `type: "button"` emitter in `lib/deliverable/recipes/` declares one |
| The popup fires on every build even when brand HAS the destination — nag fatigue, user disables it | Test: brand with a saved destination for the role → zero prompts. This is the acceptance criterion of §3.3 |
| The fail-confirm fires on house/brandless sends and blocks our own marketing | Test: no-brand user → no confirm; brand user + swfldatagulf URL → confirm |
| The confirm becomes a hard block and an agent who WANTS our page cannot ship | Test: confirm accepted → the swfldatagulf URL survives untouched |
| Rename silently re-points a button at the wrong destination (the §3.5 ambiguity) | Resolve with operator FIRST; then a test named for whichever semantic was chosen |
| A saved brand destination silently clobbers an engine-set `mailto:` reply CTA | Preserve the existing exception verbatim; regression test — it already exists in `apply-brand.ts`, do not lose it in the refactor |
| Per-listing CTA gets cached/frozen and points at last week's listing | Test: two consecutive listings produce two different destinations; nothing memoizes it across builds |
| The whole feature works in the Lab and silently does nothing on scheduled/blast sends | §6 — this is `applybrand_no_server_side_caller` and it is REAL today. Do not close it as part of this work; state plainly in the PR that non-Lab sends remain unbranded until it lands |
| Agent's saved URL is a typo/dead link and we ship it | `lib/deliverable/url-lint.ts` already exists — route saved destinations through it; warn, never silently rewrite |

---

## 5. TDD TASKS (RULE 3.5 — tests first, each named for the failure mode it targets)

1. `ButtonProps.role` added + schema + all existing emitters backfilled (one atomic commit).
2. Brand destination map: `brandingToTokens` emits per-role destination tokens; round-trips through
   `BrandingBlock` save/load.
3. Resolution order (§3.2) as a pure function with a test per rung, including "ours is last."
4. Popup gating: prompt iff no saved destination for that role.
5. Fail-confirm: fires only for brand-users on swfldatagulf URLs; accepting preserves the URL.
6. Rename semantics — AFTER the operator resolves §3.5.
7. Per-listing CTA: destination travels with the listing, changes build-to-build, never defaults to us.
8. Regression: engine-set `mailto:` reply CTA still survives the brand overlay.

Verify with `bunx next build` (NOT `npx tsc`), plus `bun test lib/email lib/deliverable`.
Recipe touched → `recipes.parity.test.ts`. Live-verify by DRIVING the builder in the lab, never by
hand-assembling the doc you wish it had built.

---

## 6. THE TRAP THAT WILL MAKE THIS LOOK DONE WHEN IT ISN'T

`applyBrand` is **browser-only**. Every non-Lab send path — scheduled sends, blasts, the worker —
never runs the overlay at all, so no brand destination applies and links stay whatever the engine
set: **ours**. You can build all six behaviors above, verify them in the lab, and the leak the
operator is complaining about will still be live on every automated send.

Open defect: `applybrand_no_server_side_caller` (open since 07/26). **Either land a server-side
`applyBrand` caller as part of this work, or say explicitly in the PR and to the operator that
non-Lab sends are not covered.** Do not let a green lab demo stand in for it.

---

## 7. BEFORE YOU START

- `superpowers:brainstorming` is mandatory (RULE 3.5) — this is a non-trivial behavior change.
- Register it: `node scripts/new-build.mjs button-links "Agent-owned button destinations saved in brand"`.
- Resolve the §3.5 rename ambiguity with the operator.
- Confirm the role roster against a fresh `grep -rn 'type: "button"' lib/deliverable/recipes/`.
- Parallel sessions are active on this repo — work in a worktree (RULE 1.5). On 08/03 a parallel
  session broad-added and pushed seven of another session's files under an unrelated commit message.
