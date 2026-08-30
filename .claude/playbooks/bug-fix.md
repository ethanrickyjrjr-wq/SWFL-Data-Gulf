---
name: bug-fix
for: a reported defect, test failure, or "why does X suck" — reproduce, scope every site of its shape, fix all of them, prove it
---
### Bug fix

**You own it: scope, fix, prove.** Announcing a fix is not one; a mechanism with pasted evidence is.

1. Scratchpad first if the operator raised it: `_ASSISTANT/SCRATCHPAD.md` entry BEFORE answering (RULE 2 §0). If the shape matches a `## shape:` in `_ASSISTANT/STRIKES.md`, add a `- strike:` line; a THIRD strike means build the guard — another entry is banned (§0b).
2. Reproduce it yourself — run the failing command / render the surface / hit the route. Paste the output. A bug you can't reproduce you can't prove fixed (`superpowers:systematic-debugging`).
3. SCOPE BEFORE FIX (RULE 0.5c): enumerate every site of the defect's SHAPE — graph `graphify_callers` / `graphify_impact` first, tree-wide grep fallback — and state the count (global / N sites named / one) BEFORE editing the first site.
4. Root-cause with evidence, not hypothesis. Belt-and-suspenders that "might help" does not ship.
5. Failing test named for the failure mode first, then green (RULE 3.5 TDD). Run it red, paste the red line, then write the fix. Deterministic logic only; a green suite does not replace an environment / data-existence / no-invention guard.
6. Fix ALL enumerated sites in the same pass. Fewer than enumerated → name why, per site.
7. Found something else in files you're already in → fix it NOW (RULE 0.85). Genuinely out of reach → `node scripts/check.mjs open <project> <key> "<label>" --class defect --detail "<what blocks>"` this session, never a SESSION_LOG sentence (RULE 2 §4).
8. Run the `second-order` agent on the fix before calling it done (FOCUS 12) — skip only if revertable in under a minute.
9. A code fix is not live until the brain rebuilds / the deploy lands (memory: code-fix-is-not-live). Say which.
10. Route to `ship` when the operator says push.

**Rules carried:** RULE 0.5c · RULE 0.8 (count, paste evidence) · RULE 0.85 · RULE 2 §0/§0b/§4 · RULE 3.5 TDD · FOCUS 9/12.

**Reply:** what broke, root cause, the N sites and which were fixed, failing-then-passing output pasted verbatim, what is NOT live yet and why.
