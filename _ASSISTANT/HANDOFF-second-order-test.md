# HANDOFF — test the `second-order` agent

Written 07/21/2026 by the session that built it. For a fresh session to verify, not to rebuild.

---

## What you're testing

`.claude/agents/second-order.md` — a read-only consequence auditor. You give it ONE change and it
reports what that change's **success** breaks. It is not a code reviewer, not a bug hunter, not a
doc-drift detector (that's `project-state-sync`), and it is explicitly forbidden from proposing a
different change.

Five passes, each derived from a real incident in `_ASSISTANT/SCRATCHPAD.md`, plus an inversion pass:

1. **Propagation** — the value is already copied into specs, plans, packs, fixtures, prompt strings.
2. **Consumers** — who reads this, in both directions (breaks something / nothing reads it at all).
3. **Latency** — a rebuild, pipeline, cron, or migration must run before the fix is live.
4. **Evidence class** — can the proposed check physically catch this failure (screenshot vs. a
   time-domain bug)?
5. **Lifecycle** — does it race, run twice, or survive a kill?

Trigger is `_ASSISTANT/RULES.md` #12 — invoke it before declaring a fix done, before moving or
deleting files, and before speaking any count or percentage. There is deliberately **no hook**; that
was the operator's call on 07/21/2026, with the hook held as a proven-later option.

---

## How to invoke

```
Agent(subagent_type: "second-order", prompt: "<the one change, described concretely>")
```

Give it the change as a statement of fact, not a question. Tell it to assume the change works. Name
the specific things worth verifying rather than assuming — it does better with a pointed prompt than
a vague one.

**Registration timing landmine (observed, not theoretical):** an agent file written mid-session does
not register instantly. Two invocations seconds after the file was written returned
`Agent type 'second-order' not found`; one turn later the same call worked, with no restart. If you
hit "not found" immediately after touching the agent file, let a turn pass before concluding the file
is broken.

---

## What a good run looks like

- Every finding cites an artifact — a `path:line`, a command with its output, or a query result.
- Findings labelled confirmed vs. suspected, with the one command that would settle a suspected one.
- It groups findings under the pass that produced them and **skips passes that found nothing** rather
  than padding.
- It closes with the single highest-consequence item, or `NOTHING FOUND`.
- It does NOT close with a recommendation about what to build instead.

## What a failed run looks like — these are the things to actually watch for

The whole risk with an agent like this is that it produces confident, plausible prose with nothing
behind it. Grade it on these, not on whether the output reads well:

1. **Fluff.** A finding with no artifact. If it says "this could affect downstream consumers" without
   naming one, that's the failure mode, and the prompt already forbids it.
2. **Padding.** Inventing a consequence to look useful. `NOTHING FOUND` is a legitimate result and the
   prompt says so explicitly — if it never returns empty on a genuinely inert change, it's fabricating.
   Worth testing directly: hand it something trivial and see whether it has the nerve to find nothing.
3. **The meta-failure.** Answering with a competing plan or a better approach. That is the behavior
   the operator is angriest about (SCRATCHPAD item 1) and the prompt bans it by name. Read-only tools
   make it structurally hard, but check the prose.
4. **Scope creep.** Doing code review or doc-drift instead of consequence analysis.
5. **Quoting a document's number as a live fact.** The rule it must apply is that a number in a spec,
   plan, or README is a hypothesis with a timestamp — if it repeats one as fact, it failed its own
   core check.

---

## Suggested first tests

**Test A — the shipment itself.** Point it at the four files this build produced (the agent, RULES.md
#12, and the two gitignored `_RESEARCH/` files). Ask it specifically to read
`.claude/hooks/inject-focus.mjs` and work out what appending rule #12 does downstream, since that hook
injects RULES.md into every prompt. The building session ran exactly this; comparing results is a
cheap consistency check.

**Test B — a real past incident, run backwards.** Take a change from SCRATCHPAD whose second-order
damage is already known and documented, describe it as if it were fresh, and see whether the agent
independently surfaces the consequence that actually bit us. Good candidates: `applyBrand` living only
in client components (item 15), or populating `fixtures/community-aliases.json` without re-running the
`neighborhood_stats` fold (item 17). If it can't rediscover a known answer with the answer in the
repo, the prompt needs work.

**Test C — the empty case.** Hand it something genuinely inert. It should return `NOTHING FOUND`.

---

## Known gaps and the falsifier

- **Unproven at volume.** As of this handoff it has been invoked once, by its author, on its own
  shipment. Treat any claim about its accuracy as untested.
- **`_RESEARCH/` is gitignored.** The research behind this agent lives at
  `_RESEARCH/agent-behavior/2026-07-21-second-order-thinking-research.md` and is present on this
  machine but **will not exist in a fresh clone**. It holds the crawl4ai sources (Farnam Street on
  second-order thinking and inversion; the live Claude Code sub-agent frontmatter contract) and the
  reasoning behind each design decision. If you're on this machine, read it. If the file isn't there,
  don't reconstruct it from memory — re-crawl.
- **The trigger is the weak point, and it was chosen knowingly.** An agent you have to remember to
  call has the same blind spot it exists to close: every logged incident happened while moving fast
  and confident. The mitigation is that `.claude/hooks/inject-focus.mjs` re-injects RULES.md on every
  prompt, so #12 stays in front of the model.
- **Falsifier, stated up front so it can't be argued away later:** if `second-order` goes uninvoked
  for two weeks, the *trigger* failed, not the agent — and the fix is the hook, not a rewrite of the
  prompt. Check invocation count before concluding the agent itself was wrong.
