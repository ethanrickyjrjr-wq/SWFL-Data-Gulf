---
name: one-room
description: Use BEFORE building or restyling ANY signed-in app page in brain-platform — anything under /project, /email-lab, /contacts, or any surface that renders inside the site header. The app is ONE room; a new page reuses the existing chrome verbatim, never invents its own. Do NOT apply generic taste skills (design-taste-frontend, high-end-visual-design, gpt-taste, redesign-existing-projects, minimalist-ui, industrial-brutalist-ui) to in-app surfaces — they optimize for distinctive NEW design, which on an in-app page produces a second product. They are for marketing/landing/showcase pages only.
---

# One room — the in-app chrome law

Locked 07/16/2026 after the projects-cockpit rejection: a full hub build was thrown
out on sight because it invented a new layout (lookalike pills, floating panel card,
hidden rail, tripled buttons) instead of reusing the chrome that already existed one
click away. Operator, verbatim: "DOES A COCKPIT CHANGE THE FUCKING LAYOUT?????" and
"WHY ARE THERE SO MANY FUCKING BUTTONS THAT ARE THE SAME AND WHY DOES IT ALL LOOK
DIFFERENT". The fix was 100% deletion of invented styling + verbatim reuse.

## The law

1. **Open the neighbor first.** Before styling anything, open the page one click
   away from yours (the email lab, the social cockpit, the rail) and lift its exact
   wrapper classes. If your page introduces a class combination its neighbors don't
   have, justify it or delete it.
2. **One action = one home.** Before adding any button/link, grep the page for the
   destination. If the action is already reachable on this page, you may not add it
   again — not as a button, not in a menu, not as a "convenient" duplicate.
3. **Persistent chrome never disappears.** The rail, the pill bar, and the aside
   column exist on every page of their area. Never conditionally hide them on one
   route ("the hub doesn't need the rail" was exactly the rejected move).
4. **The bar (test before claiming done):** navigate between your page and its
   neighbors in a real build. Rail constant, pills constant (position/size/style),
   aside constant chrome. If anything jumps, it is not done.

## Canonical chrome — lift verbatim, never restyle

- **Tool pills:** `app/project/[id]/ToolSwitcher.tsx` — THE one pill chrome. It
  accepts `id: null` for hub-style pages (same geometry, inert pills). Never build
  a lookalike row.
- **Two-column body:** the root of `app/project/[id]/social/ProjectSocialClient.tsx` —
  `grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_380px]`.
- **Main title strip:** same file, the `<main>` header —
  `border-b border-white/8 px-4 py-2.5`, breadcrumb/title/meta inline.
- **Right aside:** same file (and `components/email-lab/EmailLabGridShell.tsx`) —
  `border-l border-[#0a141a] bg-[#0f1d24]`, "✦ AI assistant" header strip, sections
  as `border-b border-white/8 px-4 pb-4 pt-4` with
  `text-[10px] uppercase tracking-[0.15em] text-gulf-teal` labels. AI is always the
  top of the right column (operator ruling 07/07/2026 + 07/16/2026).
- **Rail + list rows:** `app/project/ProjectsRail.tsx` — row =
  `rounded-lg px-3 py-2`, active = `bg-gulf-teal/15 text-white`.
- **Project entry links:** `projectEntry()` in `lib/project/tool-tabs.ts` — never
  hand-build an open-project href.
- **Aside panel sections that already exist:** `CampaignQuickStart variant="panel"`
  was built for the aside chrome — reuse it, don't wrap it in a new card.

## Forbidden moves (each one caused the 07/16 rejection)

- Lookalike chrome — a row of pills that resembles the ToolSwitcher but isn't it.
- The same action reachable from two or more places on one page.
- New container idioms (floating `rounded-xl` panel cards, new background tints)
  for content that has an existing home pattern in the aside/strip/row vocabulary.
- Hiding persistent chrome on one route because the center "replaces" it.
- `PageShell` around an in-app cockpit page — cockpit pages are full-bleed like
  `/project/[id]`; PageShell is for document-style pages.

## When taste skills DO apply

Marketing, landing, showcase, and report surfaces (`/`, `/showcase`, `/r/*`,
`/insider`, `/desk` when doing a deliberate redesign) — pages that ARE allowed a
distinctive composition. Even there, the palette/typography stays the site's own.
