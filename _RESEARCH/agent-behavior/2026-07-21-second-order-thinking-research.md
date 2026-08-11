# Second-order thinking — research + the agent it produced

Date: 07/21/2026
Method: `_RESEARCH/INDEX.md` scanned first (nothing on this topic — confirmed gap), then crawl4ai
(pinned CLI, never Firecrawl) on three live sources. Repo grounding came from
`_ASSISTANT/SCRATCHPAD.md`, not from the sources.

Produced: `.claude/agents/second-order.md` + `_ASSISTANT/RULES.md` #12.

---

## Sources crawled

1. https://fs.blog/second-order-thinking/ — Farnam Street, "Second-Order Thinking: What Smart
   People Use to Outperform"
2. https://fs.blog/inversion/ — Farnam Street, "Inversion and The Power of Avoiding Stupidity"
3. https://code.claude.com/docs/en/sub-agents — Anthropic, Claude Code sub-agents (vendor contract
   verification for the frontmatter, per the vendor-first rule)

---

## What the model actually says

**Howard Marks, via *The Most Important Thing*, quoted on the FS page:** "First-level thinking is
simplistic and superficial, and just about everyone can do it (a bad sign for anything involving an
attempt at superiority). All the first-level thinker needs is an opinion about the future... Second-
level thinking is deep, complex and convoluted."

**Ray Dalio, quoted on the same page:** "Failing to consider second- and third-order consequences is
the cause of a lot of painfully bad decisions, and it is especially deadly when the first inferior
option confirms your own biases. Never seize on the first available option, no matter how good it
seems, before you've asked questions and explored."

**The operative move is one question — "And then what?"** FS frames second-order thinking as
"thinking in terms of interactions and time, understanding that despite our intentions our
interventions often cause harm" (they link this to iatrogenics — treatment causing more harm than
benefit).

FS's four practice steps: (1) always ask "And then what?"; (2) think across time — 10 minutes, 10
months, 10 years; (3) write 1st/2nd/3rd-order consequences down and review them to calibrate; (4)
for business decisions, ask how each part of the ecosystem responds.

**Inversion (second page), Munger via Jacobi:** "man muss immer umkehren" — invert, always invert.
Munger: "All I want to know is where I'm going to die, so I'll never go there." The load-bearing
claim: forward thinking is *additive* and "increases the odds that you'll cause harm"; inversion is
*subtractive* and "is less likely to cause harm." Closing line: "Spend less time trying to be
brilliant and more time trying to avoid obvious stupidity."

**Caveat worth recording:** both pages are short essays (3 min and 2 min reading time), not
engineering method. They give a question and a disposition. They do not give a procedure. Everything
procedural in the agent came from our own incident log — which is the point, and is why the agent
cites SCRATCHPAD items rather than the blog.

---

## Vendor contract — Claude Code sub-agents (verified live 07/21/2026)

Frontmatter: only `name` and `description` are required. `name` must be lowercase-and-hyphens and is
what hooks receive as `agent_type`; **the filename does not have to match**. Also supported:
`tools`, `model`, `disallowedTools`, `skills` (preload), `memory`, `hooks`, `permissionMode`,
`mcpServers`.

Model resolution order, verbatim from the docs: `CLAUDE_CODE_SUBAGENT_MODEL` env var → per-invocation
`model` parameter → the subagent definition's `model` frontmatter → the main conversation's model.

Scope precedence: managed settings (1) → `--agents` CLI flag (2) → `.claude/agents/` project (3) →
`~/.claude/agents/` user (4) → plugin agents (5).

**Landmine for us — and the docs' hot-reload claim did NOT hold here.** The docs say Claude Code
watches `~/.claude/agents/` and `.claude/agents/` and picks up added/edited agent files "within a few
seconds... with no restart needed," with the only caveats being a newly-created `agents` directory or
`--disable-slash-commands`. Neither caveat applied: `.claude/agents/` already held 8 agents when this
session started.

**Observed 07/21/2026 — it loaded, but NOT immediately.** Two `Agent(subagent_type: "second-order")`
calls fired back-to-back seconds after the file was written both returned
`Agent type 'second-order' not found`, with the error listing every other project agent
(`website-builder`, `project-state-sync`, …). One operator turn later, the harness announced the new
agent type and the same call worked. No restart was performed.

Practical rule: **the docs' hot-reload claim holds, but registration is not instantaneous and does
not appear to land mid-turn.** Write the agent, then let a turn boundary pass before invoking it. A
single "not found" immediately after writing is not evidence the file is broken.

**Recorded because this entry was wrong twice, in opposite directions, inside one hour.** First it
asserted from the vendor doc that the agent was live without a restart — no invocation attempted,
doc quoted as fact. Then, after two failed calls, it asserted the opposite as a hard rule ("cannot be
invoked in that session — restart before verifying"), generalising from two data points taken inside
a few seconds. Both were stated with more confidence than the evidence carried. The correct posture
in both cases was the same and neither version had it: an invocation either succeeded or it didn't,
say which, and don't extrapolate a mechanism from it. This is the exact failure `second-order` exists
to catch, committed while writing `second-order`.

Also noted (not used here): plugin subagents silently ignore `hooks`, `mcpServers`, and
`permissionMode`.

---

## The repo grounding — why five passes, not a philosophy prompt

Every OPEN item in `_ASSISTANT/SCRATCHPAD.md` is a second-order failure. Items 9/11 already use the
phrase "**Second-order damage:**" verbatim. Sorting them yields five recurring shapes, which became
the agent's five passes:

1. **Propagation** — item 9/11 (a spec's floored-share figure quoted as live fact, off by 5.5×, then
   propagated into a plan doc and shaped its sequencing); item 16 (ARC copy still promising a chart
   the recipe registry had stopped shipping).
2. **Consumers, both directions** — item 6 (import count scoped to `app/` + `components/` reported
   zero consumers for something that had five repo-wide); item 15 (`applyBrand` called only from two
   React client components, so every non-browser send ships unbranded); item 5 (three modules with
   zero inbound imports).
3. **Latency** — item 17 (alias fixture populated 1→69, but the fold runs at pipeline build time, so
   the join is inert until a slow re-run); the standing "a code fix isn't live until the brain
   rebuilds" rule.
4. **Evidence class** — item 0 (five consecutive commits declared the `/graph` physics fixed, each
   judged on screenshots, while both real symptoms were time-domain); item 16's lesson (a
   command-line simulator reported green for hours while testing a hand-written copy of the send
   path, not the site).
5. **Lifecycle** — item 12 (three concurrent senders; the duplicate-send guard was read once at
   startup, which defends a re-run but not concurrency).

---

## Design decisions and their reasons

**Read-only, no edit tools.** Matches `project-state-sync` and `meddpicc-auditor`. Makes "never
propose a different change" structural rather than a promise it could talk itself out of.

**Must be allowed to return NOTHING FOUND.** Anthropic's own eval guidance (already on file at
`_RESEARCH/agent-behavior/2026-07-15-ai-steering-anti-drift-research.md`) says to give a judge "a way
out... an instruction to return 'Unknown' when it doesn't have enough information." Without the
escape hatch, an agent whose job is finding consequences invents them, and then gets ignored.

**Every finding cites an artifact.** Same source's grader guidance: cheap, objective, code-based
evidence before model judgment. A finding with no `path:line` or command output is a guess.

**Trigger = RULES.md #12, not a hook.** Operator's call, 07/21/2026. The advisor's argument for
picking this deliberately rather than by default: an agent you must *remember* to call has the same
blind spot it exists to close, because every logged incident happened while moving fast and
confident. Mitigation is that `.claude/hooks/inject-focus.mjs` re-injects RULES.md on every prompt,
so #12 is in front of the model constantly — the same mechanism that carries the no-invention rule.
**Falsifier: if `second-order` goes uninvoked for two weeks, the trigger failed and the hook is the
fix.** That is the one thing to check before assuming the agent itself was wrong.

**Explicitly not:** doc-drift (project-state-sync owns it), code review, or bug hunting. It assumes
the change works and asks what its success breaks.
