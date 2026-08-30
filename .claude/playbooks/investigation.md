---
name: investigation
for: a read-only question about OUR system — how does X work, why was Y built this way, do we have X, is there research on Z, are we sure
---
### Investigation

**You own the answer.** No code change comes out of this playbook; if one is needed, hand back and re-route to bug-fix or feature.

1. `_RESEARCH/INDEX.md` first — it is gitignored and invisible to repo-wide Grep, so "found nothing" is not evidence; scan the category, open anything relevant, say what it said (RULE 0.4 §0b). For "do we have X" use the `what-do-we-have` skill.
2. `git status --ignored --short` before concluding research or a surface doesn't exist. Check `PROJECT_MAP.md` for the root layout.
3. Structural questions go to the graph first: load `mcp__graphify__graphify_find/callers/impact/trace` in ONE ToolSearch, stamp any count with the `graph_stats` commitSha. Grep is the fallback (RULE 0.5).
4. Open the file that OWNS the behavior in this turn before any sentence about how our system behaves. Not a doc, not a sibling — the code. Otherwise say "I have not read X yet" and read it (RULE 0.5 THE BAR).
5. Any SWFL number in the answer: `docs/standards/data-roots.md` top section names its root (RULE 0.55). A data question also arms the four-lane gate → use the `data-question` playbook instead.
6. Before saying "we don't have / can't / there is no": state inline what each lane returned — research, graph/code, catalog, `git status --ignored`. Unchecked lane → the claim is provisional (RULE 0.95).
7. Answer plain text, no tables, no system nouns. Cite file paths as `path:line`.

**Rules carried:** RULE 0.4 §0/0b · RULE 0.5 (graph first, THE BAR) · RULE 0.55 pointer · RULE 0.95 · FOCUS 5/6/7.

**Reply:** the answer with the evidence trail (which lane found it, file:line), your real judgment for "are we sure", and pushback if the premise is wrong.
