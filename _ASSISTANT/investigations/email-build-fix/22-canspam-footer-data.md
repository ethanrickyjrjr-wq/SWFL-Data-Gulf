# Lane 22 — CAN-SPAM footer real-data audit across recipes

Scope: does the footer/business_address ever fall back to placeholder/fabricated data?

## What I read

- `docs/standards/emails.md` §6 (SEND) — states CAN-SPAM = 4 requirements incl. "a valid
  physical postal address in every commercial email. The footer `address` field is its home
  (from the brand profile's `business_address`); the lab nudges non-blocking when empty."
- `lib/email/CLAUDE.md` — same claim, same wording.
- `lib/email/blocks/FooterBlock.tsx` — pure render. Line 67: edit-scope placeholder text
  `"Postal address (CAN-SPAM)"` only shows when `props.address` is falsy/empty AND in edit
  scope. Unsubscribe link at line 134-145 correctly falls back to a visible "required" warning
  when missing — so the pattern for "warn, don't fabricate" exists for unsubscribeUrl but NOT
  symmetric for address (address has no visible warning at all in the rendered/sent output;
  it just silently prints whatever `props.address` holds, real or house-default).

## Where footer.address actually comes from — traced the chain

1. `lib/email/doc/default-docs.ts:35-46` — `HOUSE_BRAND.address = "Fort Myers, FL"`.
2. `lib/email/doc/default-docs.ts:146-156` — `DEFAULT_BLOCK_PROPS.footer.address = HOUSE_BRAND.address`.
   Every `seedBlock("footer")` / `seedBlockGrid("footer", …)` call across ALL `SEED_DOCS`
   templates (checked: new-listing template, just-sold, market-comps, coming-soon, open-house,
   under-contract, price-reduced, back-on-market, market-pulse, sphere-weekly, agent-launch,
   review-reply, agent-brand-intro seeds — every footer seed in the file, ~20 call sites)
   starts with this value. It is NOT empty per THE SLOT RULE (§ email map item 6) — it's a
   real committed string, so the AI-fill pass treats it as "the current answer" and keeps it.
3. `lib/deliverable/recipes/new-listing.ts`, `market-pulse.ts`, `agent-launch.ts` — grepped
   all three (+ skimmed `just-sold.ts`, `under-contract.ts`): NONE of them touch `footer` props
   at all. Recipes build hero/stats/listing/signal blocks; footer is left exactly as the seed
   shipped it. Confirms footer/business_address is NEVER a recipe-lane concern — it's 100%
   downstream of the seed default + the client-side brand overlay.
4. `lib/email/brand/apply-brand.ts:34-43` — the ONE place that can replace the seeded address.
   `if (t.ADDRESS) props.address = t.ADDRESS;` — a plain truthy-overwrite (footer, unlike the
   `hero` block's blank-only guard at line 79, doesn't need "blank-only" because in practice it's
   irrelevant: overwrite only happens if `t.ADDRESS` exists at all).
5. `lib/email/brand/branding-to-tokens.ts:43-45,78` — `set("business_address", "ADDRESS")` uses
   the generic `set()` helper: `if (typeof v === "string" && v.trim()) t[token] = v.trim();`.
   If the account's `user_brand_profiles.business_address` is null/empty, `t.ADDRESS` is simply
   never populated — `set()` is silently a no-op, by design ("unknown/empty fields are simply
   skipped", file header comment).
6. `docs/sql/20260703_user_brand_business_address.sql` — `business_address text` column, no
   `NOT NULL`, no default, nothing else enforces it gets filled at onboarding. It is an ordinary
   optional field in the brand profile form.

## The gap

Chain the above: agent signs up, never fills in "business address" in their brand profile (it's
optional, no gate anywhere blocks send on it) → every email they build from any seed template
ships a footer with `address = "Fort Myers, FL"` — SWFL Data Gulf's own placeholder city/state,
NOT the agent's real address, NOT even a complete street address for anyone. `applyBrand` DOES
correctly swap in `COMPANY_NAME`/`AGENT_NAME` when the agent has set those (common, since name is
probably filled in more often than a physical address), so the shipped footer can read something
like:

  Jane Smith Realty
  Fort Myers, FL
  [real unsubscribe link]

— a real agent name paired with a city that isn't theirs, format that isn't even a complete
mailing address. This fails the CAN-SPAM "valid physical postal address" requirement on TWO axes:
(a) it's not the sender's actual address — it's silently borrowed from the platform's own house
brand default, and (b) "Fort Myers, FL" alone (no street) is not a complete deliverable postal
address as the map's own §6 citation (FTC / Shopify guide) requires (street address, PO box, or
registered mailbox service — not city+state).

This is NOT a data-provenance violation of the four-lane rule in the invented-NUMBER sense (it's
not a fabricated real-estate figure), but it IS exactly the failure mode this lane was asked to
check: a compliance-critical field silently defaulting to platform placeholder content instead of
real account data, with no warning surfaced anywhere in the actually-rendered/sent output (the
edit-scope-only placeholder text in FooterBlock.tsx never appears because the field is never
actually empty — it's pre-filled with someone else's address).

## Ruled out

- Not an issue in the recipe builders themselves — checked new-listing.ts, market-pulse.ts,
  agent-launch.ts (+ skimmed just-sold/under-contract) — none touch footer, so this isn't a
  per-recipe inconsistency, it's systemic (every recipe inherits the same seed default).
- Not a total absence of a warning mechanism — `unsubscribeUrl` DOES get a visible "required" span
  when missing (FooterBlock.tsx:140-144). Address has no equivalent because it's never "missing"
  by the time it renders — the house-brand string masks the missing-real-data state.
- Confirmed via `docs/standards/emails.md` and `lib/email/CLAUDE.md` that this "nudge when empty"
  design intent exists in prose, but the code makes "empty" essentially unreachable for footer
  address given the HOUSE_BRAND default.

## Proposed fix (not applied — diagnosis only per instructions)

Two independent, non-exclusive options:
1. Stop pre-filling `footer.address` with `HOUSE_BRAND.address` in `DEFAULT_BLOCK_PROPS`
   (default-docs.ts:148) — treat it like the other THE-SLOT-RULE data-dependent fields (ship
   `""`) so it's a genuinely open slot; then FooterBlock's existing "Postal address (CAN-SPAM)"
   edit-scope placeholder and a NEW visible warning on the rendered/sent path (mirroring the
   unsubscribe pattern at lines 140-144) actually fire when an account has no business_address.
2. Add a compliance gate at build/send validation (`lib/deliverable/claims.ts` or a send-time
   check in the blast/schedule paths) that blocks or loudly flags a commercial send whose footer
   address still equals the literal `HOUSE_BRAND.address` sentinel — cheap, deterministic check,
   catches it regardless of seed authoring going forward.
Either requires the operator to decide product behavior (block send vs. warn) — out of scope for
this diagnosis-only pass.
