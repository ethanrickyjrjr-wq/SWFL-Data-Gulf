---
description: Personal Vault — bank a strategic insight, recall prior thinking by term/tag, or export a backup. Three modes; default is bank.
---

# /vault — Personal Strategic Vault

You are the capture + recall layer over the `personal_vault.vault_fragments` Supabase table. The user (Ricky) is mid-conversation and wants to either **bank** a thought, **recall** prior thinking, or **export** a backup — without breaking flow.

Three modes, dispatched by the first token of `$ARGUMENTS`:

| First token     | Mode       | What you do                                                                                                   |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| `recall`        | **Recall** | Shell out to `vault-list.mts`, parse JSON, re-narrate matching fragments back into the chat.                  |
| `export`        | **Export** | Shell out to `vault-export.mts --latest`. Report the file path.                                               |
| (anything else) | **Bank**   | Treat the entire `$ARGUMENTS` as the raw insight. Extract slug + tags, then shell out to `vault-capture.mts`. |

If `$ARGUMENTS` is empty, ask Ricky what mode he wants — don't guess.

---

## Mode: BANK (default)

The user just had a strategic moment. Your job is to capture it cleanly and shell out to the dumb-pipe capture script. **The script never guesses tags — you do all the SKOS reasoning here.**

### Step 1 — Read the vocab

Use the `Read` tool on `refinery/vocab/brain-vocabulary.json`. This is the source of truth for valid `tags`. Each concept has `id`, `prefLabel`, `altLabels`, `raw_slugs`, `category`, and `domain`.

### Step 2 — Synthesize the fields

From the raw input, produce:

- **`slug`** — short kebab-case handle (≤ 6 words). E.g. `"Industrial supply on I-75 is tightening…"` → `i75-industrial-supply`. Must match `/^[a-z0-9-]+$/`.
- **`insight`** — the user's claim, lightly cleaned up. Preserve their voice and any numbers verbatim. Must be ≥ 20 chars.
- **`tags`** — 1–4 SKOS concept IDs that match the insight's content. Match on prefLabel, altLabels, raw_slugs, AND scope_note. Prefer specific over general. If nothing fits, surface that — DO NOT invent tags.
- **`confidence`** — only if the user signaled certainty (e.g. "I'm sure", "low confidence", "0.8"). Otherwise omit and let the script default to 0.70.
- **`source_chat`** — always include `claude-<today>-<short context>` (e.g. `claude-2026-05-17-vault-ship`).

### Step 3 — Surface your proposal before shelling out

Show Ricky a one-block summary:

```
slug:    i75-industrial-supply
tags:    cre_industrial_vacancy, qual_sentiment_direction
conf:    0.75 (you said "high confidence")
insight: Industrial supply on I-75 is tightening…
```

Ask: "bank as-is, edit, or skip?" — wait for a Y/edit/N response. Don't auto-shell.

### Step 4 — Shell out

On Y, run via `Bash`:

```
bun refinery/tools/vault-capture.mts \
  --slug=<slug> \
  --insight="<insight escaped>" \
  --tags=<tag1,tag2> \
  --source-chat=<source_chat> \
  [--confidence=<0..1>]
```

If the capture script exits 1 with a "did you mean" suggestion, present those suggestions to Ricky verbatim and let him choose.

On success, the script prints `[vault-capture] banked id=… slug=… vintage=… revisit=… conf=… tags=[…]`. Report that line back, no embellishment.

---

## Mode: RECALL

The user typed `/vault recall <stuff>`. They want to pull prior thinking back into context.

### Step 1 — Parse the recall query

Strip the leading `recall ` from `$ARGUMENTS`. The remainder is either:

- `<free-form term>` → ILIKE search across `insight` + `context_slug` (script's `--search=…`)
- `--tag <concept_id>` → exact array-contains filter (script's `--tag=…`)
- `<term> --tag <concept_id>` → both filters combined

Both flags also accept `--status=all` (default is active only) and `--limit=N` (default 20).

### Step 2 — Shell out and parse JSON

```
bun refinery/tools/vault-list.mts --json [--search="<term>"] [--tag=<id>] [--status=all] [--limit=N]
```

The output is a JSON array of fragment rows: `{ id, context_slug, insight, tags, vintage, confidence, status, ... }`. Parse it.

### Step 3 — Re-narrate in chat

- **0 matches** → say so, plainly. Suggest variations of the term Ricky might try. Don't pretend you found something.
- **1–3 matches** → render each as a bullet: `**<context_slug>** (banked <vintage>, conf <confidence>) — <insight>`. Include the tag list as a subtle footer.
- **4+ matches** → render all bullets, AND prepend a 1-sentence synthesis of the through-line ("Across these N fragments, the recurring theme is …"). The synthesis must be drawn from the fragments themselves — quote, don't invent.

Always end with a one-line reminder: "_(These are vault fragments — soft strategic context, not hard receipts.)_"

---

## Mode: EXPORT

The user typed `/vault export`. Shell out:

```
bun refinery/tools/vault-export.mts --latest
```

Report the two file paths the script prints. That's it.

---

## Hard rules

- **You do tag reasoning. The script does not.** Never let the script guess; always pass `--tags=…` explicitly.
- **Wait for confirmation before banking.** No silent inserts. The bank step is cheap — the wrong-banked fragment is expensive to clean up later.
- **Pass through script output verbatim.** Don't summarize, don't paraphrase. Ricky needs the UUID + tag confirmation for audit.
- **Never read the table directly** (no `mcp__supabase` or raw queries). Always go through `vault-list.mts` / `vault-capture.mts` / `vault-export.mts` so behavior stays consistent with terminal usage.
- **Recall results are soft data.** When re-narrating, never quote a vault number as if it were a Census/SBA hard fact. Use phrases like "your prior thesis was …", "you previously hypothesized …", "the vault holds a fragment from <vintage> saying …".

## Failure surface

- `--schema must be one of …` → tell Ricky to add `personal_vault` to Project Settings → API → Exposed schemas in the Supabase dashboard. One-time setup.
- `missing required env var(s): supabaseUrl, supabaseKey` → tell Ricky to populate `BRAINS_SUPABASE_URL` and `BRAINS_SUPABASE_SERVICE_KEY` in `.env.local`.
- `unknown SKOS concept` → show the script's "did you mean" suggestions verbatim and let Ricky pick or correct.

---

`$ARGUMENTS`
