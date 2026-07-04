# 02 — Close the PowerShell push-gate bypass

- **Status:** ⬜ Not started
- **Owner:** SESSION (one-word edit; the harness blocked the session that found it from self-editing the guard)
- **Source:** autopsy §6 (blocked-by-harness) + §7 + §10 ("guards you cannot trust")

## What

Pushes through the **PowerShell tool bypass all 9 pre-push gates.** The hooks block (~line 68 of
`.claude/settings.json`) has `"matcher": "Bash"`. The PowerShell tool is not matched, so a push
issued via PowerShell skips every gate (session-log, lockfile, vocab, secrets, ingest, pack⇆catalog).

## Steps

1. In `.claude/settings.json`, find the push-gate PreToolUse hooks block (~line 68).
2. Change `"matcher": "Bash"` → `"matcher": "Bash|PowerShell"`.
3. Verify the same matcher change is needed on ALL push-gate hook entries, not just the first
   (check-session-log-on-push, check-prepush-gate) — probe the file, don't assume one block.

## Done when (live proof)

- Attempt a trivial `git push` **via the PowerShell tool** with an uncommitted-SESSION_LOG state →
  the gate now **blocks** it (previously it sailed through). Reverse-verify the Bash path still blocks too.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
