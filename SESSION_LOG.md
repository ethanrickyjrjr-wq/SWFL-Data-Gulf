# SESSION_LOG.md — Append-Only Cross-Session Memory

**Read this on session start. Append to it before every `git push`.**

Format per entry (newest at top):

```
## YYYY-MM-DD HH:MM (model · branch)
- What changed (1–3 lines, present tense, file paths welcome)
- What's next / what's blocked
- Links: PR #, issue #, plan path
```

If a hook blocks your push, that's the system working. Fix the entry, then push.

---

## 2026-05-26 (Sonnet 4.6 · feat/permits-swfl-v2)

- Rebased `feat/permits-swfl-v2` (651c102) onto main (c19d3ca); 1 commit, clean.
- Added `--dry-run` to `ingest/pipelines/lee_permits/pipeline.py` + test; 33/33 green.
- Updates PR #29 (already open); no new PR needed.
- Next: merge PR #29 after CI green; add `--dry-run` to `redfin_swfl` on separate branch.

## 2026-05-26 (Opus 4.7 · main)

- Installed enforced session-log mechanism: `SESSION_LOG.md` (this file), SessionStart hook prints last entries + verifies CLAUDE.md rule marker, PreToolUse hook blocks `git push` when no entry was added since upstream.
- Files: `.claude/hooks/print-session-log.mjs`, `.claude/hooks/check-session-log-on-push.mjs`, `.claude/settings.json`, `CLAUDE.md` (top-of-file rule with `<!-- SESSION-LOG-RULE-MARKER -->`).
- Open in working tree: `M ingest/pipelines/lee_permits/pipeline.py` (uncommitted, not from this work).
- Next: confirm hooks fire after restart; first real push will exercise the gate.

## 2026-05-25 (prior session · main)

- Seed entry — see git log for c19d3ca (GHA unblock + brand scrub), 86435b8 (Lane D fully live), c3b9d0a (waitlist env-name fallback #30).
