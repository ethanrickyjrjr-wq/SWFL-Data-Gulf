# TASK 21 — Render route accepts `{ doc }`   🟢 SONNET

**Wave:** 2 · **Depends on:** 20 · **Parallel-safe with:** 30/31/32
**Owns (only edit these):**
- `app/api/email-lab/render/route.ts`  *(modify existing)*

## Build
Add a `{ doc: EmailDoc }` branch that returns `{ html: await render(<EmailDocEmail doc={doc} />) }` (import `render` from `@react-email/render`, `EmailDocEmail` from Task 20). **Keep** the legacy `{ template, tokens }` branch (it still serves the 5 structural "classic" templates). Spec → *Rendering strategy* + *Template regression*.

## Acceptance
- `bun test` green. POST `{ doc }` → valid HTML string; POST `{ template, tokens }` → still works.

## Isolation
One route file. Don't touch the AI route (Task 12).
