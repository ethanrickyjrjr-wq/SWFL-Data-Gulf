# Live AI build streaming — email + social canvases

**Date:** 2026-08-18
**Approved:** in chat by the operator, 08/18/2026 ("go"), after the salt.md evaluation.
**Check:** `live_build_streaming_live_verify` (opened same session).

## Problem

Both AI build lanes are turn-based: the user clicks build, stares at a spinner, and one
JSON blob lands seconds later.

- **Email:** `POST /api/email-lab/ai` runs `authorDoc` server-side and returns the whole
  `EmailDoc` at once. The email build is the longest wait in the product — comps + chart +
  commentary in one request.
- **Social:** `POST /api/email-lab/social/generate` (fill mode → `buildSocialCanvasFill`,
  author mode → `authorSocialPost`) returns the whole fill/design at once.

The idea came out of evaluating salt.md (08/18/2026): the one pattern worth taking from it
is *agent and human on the same object, live, with the agent's presence announced*. We do
NOT adopt salt.md (second product inside the one room; its generic editor bypasses every
EmailDoc gate). We build the pattern on our own stack.

## Goal

The user watches their build assemble on the canvas and can edit blocks the moment they
land, with a status chip naming what the AI is working on. Zero new vendor spend, zero
extra model spend — the same build runs; only *when the user sees it* changes.

## Transport — decided, do not relitigate

**Our own route streams its response. No Supabase Realtime, no third-party channel.**
Operator, 08/18/2026: "why would we pay supabase when we can do it for free." He was right:
v1's need is one browser watching its own request — that is a streamed HTTP response on the
connection already open, not a pub/sub problem.

- Vendor contract verified live 08/18/2026: Next.js route handlers stream by returning a
  Web `ReadableStream` in the `Response` — no library needed
  (https://nextjs.org/docs/app/api-reference/file-conventions/route#streaming, page dated
  04/30/2026). Streaming works on the Node.js runtime we already declare (`runtime =
  "nodejs"`); no edge runtime, per app/api/CLAUDE.md (98 nodejs routes, zero edge).
- Wire format: newline-delimited JSON events (`application/x-ndjson`). Simpler than SSE
  framing for a fetch()-consumed stream, and the client is ours — no EventSource needed.
- A vendor channel (Supabase Realtime) becomes relevant ONLY if two devices must see one
  canvas simultaneously. Not in scope; do not add it speculatively.

## Event protocol (shared by both lanes)

One protocol, two producers. Every event is one JSON line:

- `{"e":"status","label":"…"}` — what the AI is working on ("pulling comps",
  "writing commentary"). Powers the presence chip.
- `{"e":"skeleton","doc":<EmailDoc>}` — email lane: the recipe's coded grid, brand chrome
  applied, content slots open. Lands first, instantly paintable.
- `{"e":"block","id":"<blockId>","props":{…}}` — email lane: one block's content as its
  stage completes (sourced facts → chart → prose).
- `{"e":"slot","id":"<elementId>","text":"…"}` — social lane: one slot's cited text.
- `{"e":"done","doc":<full validated payload>}` — the complete final result, identical in
  shape to today's non-streaming response. The client reconciles against it.
- `{"e":"error","message":"…"}` — terminal; canvas keeps whatever landed.

**Every content-bearing event is validated server-side before it is written to the stream**
(email: block shape against `EmailDocSchema`; social: the same fill validation that gates
today's response). The full-document gate still runs before `done`. Nothing reaches the
canvas that today's gates would have blocked.

## Phase 1 — email lab

- `POST /api/email-lab/ai` gains a streamed response (`stream: true` in the body; the
  non-streaming shape stays for existing callers until both canvases are migrated, then
  the flag becomes the default).
- `authorDoc` (`lib/email/build-doc.ts`) gains an optional progress callback — the stage
  boundaries already exist in code (skeleton build → `fillSkeletonFromSources` →
  `upsertChartBlock` → author pass); the callback emits at each. No change to what
  `authorDoc` computes, sources, or gates.
- `EmailLabGridClient` / `ProjectEmailLabClient`: consume the stream, paint skeleton
  immediately, apply `block` events, show the status chip.
- **Race rule — the human wins.** The client keeps a `touchedBlockIds` set (any block the
  user edits after it lands). A `block`/`done` update for a touched block is dropped
  block-wise; `done` reconciliation merges around touched blocks, never over them.

## Phase 2 — social composer

- `POST /api/email-lab/social/generate` streams `status` + `slot` + `done` for both fill
  and author modes. Same client pattern on the social canvas.

## What does NOT change

- `authorDoc`'s contract, the no-invention gates, voice guard, chart coherence, CAN-SPAM
  footer handling — untouched.
- **Persistence.** The stream paints; it never writes. Saving stays the explicit save to
  `deliverables` exactly as today. No double-write path exists by construction.
- Build allowance / usage recording (`checkBuildAllowance` / `recordBuild`) — unchanged,
  still one build per request.
- Tier routing (`lib/email/lab/capabilities.ts`) — streaming is a delivery mechanism, not
  a capability; it routes `"both"` implicitly by not being gated at all.

## Failure modes → guards (RULE 3.5)

1. **AI event races a user edit** → `touchedBlockIds` drop rule above; unit test poisons a
   touched block and asserts the AI update never lands on it.
2. **Connection drops mid-build** → `done` carries the full doc for reconciliation; if it
   never arrives, the canvas keeps delivered blocks and shows "build interrupted — retry".
   Nothing half-built can be saved silently because saving is explicit.
3. **Unvalidated content on canvas** → per-event server-side validation + the existing
   full-doc gate before `done`; test feeds an invalid block through the emitter and asserts
   the stream carries `error`, not the block.
4. **Client double-applies events after retry** → each stream is single-use; a retry
   resets the canvas to the last saved doc (or blank) before consuming a new stream.
5. **Route duration** → `maxDuration` already declared (60s social; email per its route);
   streaming keeps bytes flowing and changes no compute. If a build exceeds today's limit,
   it already fails today — not a new mode.
6. **Old client hits new route (deploy skew)** → the `stream` flag defaults off until both
   clients ship; a non-streaming request gets today's exact JSON.

## Testing

- Emitter unit tests (event order, validation drop, error framing) — pure, no model.
- Race-rule client-logic tests (`touchedBlockIds` set/merge) — pure.
- One integration walk per lane with the model mocked at the same boundary
  `campaign-sim` uses.
- Live-verify: `node scripts/check.mjs close live_build_streaming_live_verify` only after
  watching a real build stream in the browser (render-and-look rule).

## Cost

Zero new vendor spend (own-route streaming). Zero added model spend (same single build per
request). Client bundle: no new dependency.
