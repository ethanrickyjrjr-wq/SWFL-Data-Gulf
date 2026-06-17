# Piece 2 Deferred Steps — Design (2026-06-17)

> Implements `piece2_ui_state_writeback` (§8), `piece2_gated_llm_accelerators` (§9), and
> `piece2_g1_action_surface` (G1) from the main Piece 2 spec
> (`2026-06-17-piece2-project-aware-ai-design.md`). `piece2_live_verify` is a manual
> prod-verify check closed post-deploy.

## §9 — Gated LLM Accelerators

**File:** `lib/project/flags.ts`

Three default-OFF env-injectable flag functions mirroring `lib/highlighter/flag.ts` (which
is default-ON). These functions are called in the respective accelerator code paths so the
deterministic baselines always run; LLM layers are no-ops unless the env var is set.

| Function | Env var | Default |
|---|---|---|
| `promptPolishEnabled()` | `PROMPT_POLISH_ENABLED` | OFF |
| `prebuildEnabled()` | `PREBUILD_ENABLED` | OFF |
| `assembleLlmEnabled()` | `ASSEMBLE_LLM_ENABLED` | OFF |

ON condition: `=== "1" || === "true"`. Test: 3 × 3 matrix (off/on-1/on-true for each).

## §8 — UI State Write-back

### Type extension

`workspace/types.ts` → `ProjectUiState`:
- `last_freshness_token_seen?: string` — the freshness token the user last acknowledged
- `dismissed_overlap_keys?: string[]` — overlap dedupe keys suppressed from prompts

Both additive (the `[key: string]: unknown` index signature already handles unknown keys
in the PATCH body; typed fields make callers type-safe). `dismissed_overlap_keys` UI is
deferred — the cross-project index respects it when written; no dismiss button ships here.

### Freshness banner

Location: above `<ItemsBoard>` in `ProjectWorkspace.tsx`.
Condition: `digest.freshnessChangedSinceSeen && digest.freshnessToken`.
On dismiss: `patchUiState({ last_freshness_token_seen: digest.freshnessToken })`.

Visual: a single-line strip — `border-[#00d4aa]/20 bg-[#00d4aa]/5 rounded-lg py-2 px-3` —
with a pulsing `●` dot (teal, `animate-pulse`) + "Your data has fresh figures." + "Got it →"
dismiss link in teal. One line, no permanent local state — dismiss writes back via
`patchUiState`, which updates `uiState` optimistically, which resets
`lastFreshnessSeen`, which recalculates `digest.freshnessChangedSinceSeen` to `false`.

## G1 — Authenticated Action Surface

### Route: `POST /api/projects/[id]/action`

Auth: `createClient(await cookies())` → `getUser()` → 401 if `!user`. Project ownership:
`supabase.from("projects").select("id").eq("id", params.id).eq("user_id", user.id).single()`
→ 404 if `!data` (RLS-equivalent; never service-role for the ownership check).

**Phase 1 — PROPOSE:** `{ intent: string }`

1. Haiku (`claude-haiku-4-5`) with forced `classify_action` tool.
2. Tool output: `{ action: "schedule_send" | "build_deliverable" | "unknown", params, summary }`.
3. Issue nonce via `issueProposalNonce` from `lib/email/proposal-nonce` (reuse — it takes
   arbitrary `{ uid, pid, proposal }` opaque payloads).
4. Return `{ type: "PROPOSE", action, summary, proposal_nonce, proposal: { action, params } }`.
5. `action === "unknown"` returns 422 immediately — no nonce issued, CONFIRM path unreachable.

**Phase 2 — CONFIRM:** `{ confirmed: true, proposal: {...}, proposal_nonce: string }`

1. Verify nonce → 401 if invalid; claim once via `claimOnce` → 409 if already used.
2. Route by `proposal.action`:
   - `schedule_send` → `createOrTouchSchedule(supabase, { projectId: id, ...params })`
   - `build_deliverable` → `fetch(process.env.NEXT_PUBLIC_SITE_URL + /api/projects/${id}/build, ...)`
     (internal call with service-role cookie not appropriate; use a direct lib import instead —
     see implementation note)
3. Return `{ type: "CONFIRMED", result }`.

> **Implementation note on build_deliverable CONFIRM:** The build route calls
> `assembleDeliverable`. Calling the HTTP endpoint server-to-server introduces auth
> complexity. Instead, G1 CONFIRM for `build_deliverable` calls `assembleDeliverable`
> directly via import if the function is exported from `lib/deliverable/assemble.ts`.
> If it isn't directly importable, fall back to calling the route's POST handler as a
> function (Next.js supports importing route handlers). Check and adjust at implementation.

### Component: `workspace/ProjectActionBar.tsx`

Client component. Hidden when `!authed`. Rendered below `<BuildActions />` in
`ProjectWorkspace.tsx` — receives `projectId` and `authed` as props.

**States:**
1. **Idle** — section label "Assistant" + input row
2. **Loading** — spinner in the input area while Phase 1 runs
3. **Proposed** — proposal card with action summary + Confirm + Cancel
4. **Confirming** — spinner on Confirm button while Phase 2 runs
5. **Confirmed** — `✓` success message, resets to idle after 2s
6. **Error** — inline error text in `text-red-400`, resets on next submit

**Visual:** Terminal-command aesthetic — `➜` prefix in `text-[#00d4aa] font-mono` inside
the input wrapper. Proposal card: `border-[#00d4aa]/30 bg-[#00d4aa]/5 rounded-xl`.
Confirm: `bg-[#00d4aa] text-[#04121b] rounded-full`. Cancel: `text-gray-400 text-xs`.

**Signature element:** The `➜` prompt prefix. Reads "direct command," not "chat" — a
visual distinction from the pill's chat bubbles that matches the broker audience.

### RULE 1 gate

G1 is a live-response authenticated surface → "ask for diff review before pushing."
Commit everything but stop before `safe-push`; show the diff; operator approves before push.
