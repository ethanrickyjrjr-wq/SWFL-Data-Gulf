# Playbooks — one file per TASK TYPE

The per-task-type half of scoped rule injection (NORTH STAR #3). `inject-playbooks.mjs`
emits an index of these on every prompt; the model matches the task to ONE playbook,
opens it, and copies the steps verbatim as the first todo items. A step not done stays
listed with `skip: <reason>`.

Shape stolen from cursor/plugins **pstack** (evaluated 08/30/2026,
`_RESEARCH/agent-behavior/2026-08-30-cursor-pstack-evaluation.md`). Ours differ in one way:
each playbook carries a `**Rules carried:**` line naming the CLAUDE.md rules it now
delivers. That line is the deletion map — once a rule is carried by every playbook that
needs it, its body leaves CLAUDE.md (RULE 0.55's DROP discipline: replacement runs first).

Frontmatter contract (linted by `.claude/hooks/lib/playbooks.test.mjs`): `name:` == filename,
`for:` one line the model routes on, a `### ` heading, `1.`-numbered steps,
`**Rules carried:**`, `**Reply:**`, under 4,500 chars. A playbook is a checklist, not a doc.
