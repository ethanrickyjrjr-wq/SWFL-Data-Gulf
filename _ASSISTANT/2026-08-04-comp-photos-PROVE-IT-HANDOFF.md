# HANDOFF — build ONE comps email and look at it. That is the whole job.

**Written 08/04/2026.** Do this FIRST, before anything else in the email area.

## The one sentence

Two fixes landed hours apart on 08/03–08/04 and **nobody has rendered a comps email since**:
the aerials were deleted platform-wide, and the Apify photo lane was unblocked. Either the comp
rows now show real listing photos, or they show blank slots. **Nobody knows which.** Find out.

## What changed, and why that leaves a hole

1. **Aerials deleted** (parallel session, 08/03/2026, after operator decree
   *"WE CAN'T HAVE FUCKING ARIEL VIEWS....AGAIN!!!! PHOTOS OF THE FUCKING LISTING. THAT'S IT AND
   LINK TO REALTOR.COM LISTING OR SOLD LISTING OF THE PROPERTY."*). `lib/listings/aerial.ts` is
   GONE; 4 call sites cleaned incl. `resolveCompThumbnails`; `lib/deliverable/no-aerial.test.ts`
   guards it. Standing rule: **a property visual is a real photo of that listing, or it is
   NOTHING.** Never a satellite tile, not even as a fallback.
2. **The Apify photo lane was never running** (commit `e858349a`, 08/04/2026). `runApifyActor`
   read `process.env.APIFY_TOKEN`; the operator's local env file carries `APIFY_KEY`. The miss
   returned `[]` **silently**, which is byte-identical to "this house has no photos." So the lane
   ran on every build, found nothing, and said nothing. Now reads `APIFY_TOKEN ?? APIFY_KEY` and
   warns. Key live-verified: `GET api.apify.com/v2/users/me` → HTTP 200.

**The hole:** fix 1 removed the thing that was filling those slots. Fix 2 restored the thing that
is supposed to fill them. They were never tested together. The operator's screenshot
(08/03 15:11, six broken "Aerial view of 330…" slots) is from BEFORE both — do not treat it as
current evidence, and do not re-diagnose from it.

## Do this

**Step 1 — build one comps email against a real address, dry run, no send.**
`bun scripts/email/campaign-sim.mts` is the sanctioned dry-run driver (see `lib/email/CLAUDE.md`):
it drives all seven listing recipes through the real `authorDoc` on one real listing, no send
unless `--send`. Either use it or call `buildMarketComps` directly with a resolved
`RecipeBuildContext` (`lib/deliverable/recipes/index.ts:59`). Write the HTML to a file.

**Step 2 — LOOK AT IT. Open the file in a browser.** Not the test result, not the byte count.
The question is "do six comp rows show six real photos of six real houses." A passing render is
not an answer.

**Step 3 — report the count honestly.** "5 of 6 rows have a photo" is a fine answer. "The photo
lane works" is not.

## What to check, each with the failure it catches

- **Photo present per comp row?** → count them. A partial fill is the likely outcome and is fine;
  a SILENT partial fill is the defect.
- **Is the image URL reachable?** A URL in the HTML is not a rendered photo. `curl -I` each one
  for a 200 — the operator's screenshot was broken images with valid-looking markup. rdcpix photo
  rot was falsified at 5 months (HTTP 200) in the 08/02 research, so a 404 means a bad URL, not
  an expired one.
- **Zero aerials?** → `no-aerial.test.ts` should already stop this. Confirm it runs on this doc.
- **Does every row link to the realtor.com detail page?** Second half of the same decree, and it
  is the fallback when there is no photo: **no photo → still a link, never a placeholder image.**
- **Is the console warn silent?** If `[apify-comps] no APIFY_TOKEN / APIFY_KEY` prints, the env
  did not load in that process — the key is correct, so that is a loading problem, not a key
  problem. Do not go re-diagnose the key.

## Do NOT

- **Do not measure fonts.** Already done, 08/04/2026, `bun scripts/email/scale-census.mts`:
  9 blocks, 11,051 bytes, sizes 14/16/28/44/12px and weights 500/400/600 — every value on the
  scale, zero violations. Type is not the problem and re-measuring it is how the last session
  burned an hour answering a question the operator never asked.
- **Do not start the render convergence** (`_ASSISTANT/2026-08-04-render-convergence-HANDOFF.md`).
  It touches the share page and the PDF, not this. It fixes nothing here.
- **Do not open a check instead of running the build.** That happened twice on 08/03. If the work
  is "read a file" or "run one command," do it.
- **Do not ship a placeholder, a stock photo, a map, or a gray box** if a comp has no photo.
  Empty slot plus the listing link. That is the decree.

## Open checks this closes or touches

- `apify_comp_email_live_verify` — **this handoff is that check.** Close it with the rendered
  file path and the photo count, not with "the lane is wired."
- `comp_email_rules_card_conformance` — while the doc is open, also check it against
  `docs/standards/emails.md` §0: body 50–125 words (property description and community block do
  NOT count), 1–3 questions, one CTA. Never audited against a built comps doc.
- `comp_email_font_scale_unverified` — **can be closed now**, evidence above.

## Read first

- `docs/standards/emails.md` §00 (the pipe) and §0 (the rules card).
- `_ASSISTANT/2026-08-03-apify-comp-email-HANDOFF.md` — the original build brief.
- `_RESEARCH/competitor-and-strategy/2026-08-03-apify-actor-fit-assessment.md` — the live-proven
  2-step sold-comp recipe, incl. `alt_photos` full gallery (50 photos on one home) and the
  ~$0.01/result cost. Gitignored; Grep cannot see it; open it by path.
