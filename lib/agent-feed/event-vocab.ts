// lib/agent-feed/event-vocab.ts
// ONE authority for the listing-transition event vocabulary (L4 fix round, hermes-email-driver
// spec 2026-08-10). Extracted from app/api/agent-feed/test-inject/route.ts, where these three
// sets were first derived and traced directly against the ingest pipeline source (RULE 0.5) --
// NOT invented from the plan's shorthand. app/api/agent/build/route.ts duplicated a copy of
// VALID_TO_STATES/VALID_SALE_OR_RENT rather than importing it; both routes now read from here.
//
// PROVENANCE (traced during Task 4, re-verified before this extraction):
//   - VALID_TO_STATES -- ingest/pipelines/listing_lifecycle/pipeline.py:65-70 (_keyed_scan)
//     forces state="active" on every scanned row before diff_states ever runs, so the ONLY
//     values ever actually WRITTEN to listing_transitions.to_state are: "active" (every
//     appearance/re-appearance/same-state price move), "holding" (transitions.py:135-137 --
//     the ambiguous-departure state), and "sold" / "withdrawn" (transitions.py:135-136 -- the
//     two terminal resolutions of a holding row). transitions.py:22's _LIVE_STATES
//     ({"active","new","coming_soon","back_on_market"}) is a MEMBERSHIP-TEST set, not a write
//     list -- "new"/"coming_soon"/"back_on_market" are NEVER actually assigned as a to_state.
//     The new-listing signal is from_state IS NULL (transitions.py:54-57), never a "new"
//     to_state value.
//   - VALID_FROM_STATES -- drawn from the SAME 4-value vocabulary, when present. NULL is a
//     distinct, meaningful, and legal value (the new-listing signal) -- callers must check
//     presence separately, never validate `null` against this set.
//   - VALID_SALE_OR_RENT -- the current lifecycle pipeline only ever writes "sale"
//     (extract.py:144, extract_api.py:185), but the column itself (address_key.py:5, the
//     migration's own default) treats sale_or_rent as a real two-value category -- "rent" is
//     a legitimate future value, not an invented one.
export const VALID_TO_STATES = new Set(["active", "holding", "sold", "withdrawn"]);
export const VALID_FROM_STATES = VALID_TO_STATES;
export const VALID_SALE_OR_RENT = new Set(["sale", "rent"]);
