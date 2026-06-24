# TASK 10 — Block components ×10   🟢 SONNET

**Wave:** 1 · **Depends on:** 00 · **Parallel-safe with:** 11, 12, 31, 32
**Owns (only edit these — each file is independent → splittable up to 10 ways):**
- `lib/email/blocks/HeaderBlock.tsx` · `HeroBlock.tsx` · `StatsBlock.tsx` · `SignalBlock.tsx` · `TextBlock.tsx`
- `lib/email/blocks/ImageBlock.tsx` · `AgentCardBlock.tsx` · `ButtonBlock.tsx` · `DividerBlock.tsx` · `FooterBlock.tsx`

## Build
Pure presentational components using `@react-email/components` — same pattern as `scripts/email/DigestEmail.tsx` (read it first). Each takes `{ props, globalStyle }`, reads color/font from `globalStyle` (never inline a color the AI could clobber).

| File | RE primitives | props |
|---|---|---|
| HeaderBlock | Section, Img, Text | logoUrl, companyName, tagline, bgColor |
| HeroBlock | Section, Text | kicker, value, label, prose |
| StatsBlock | Section, Row, Column, Text | stats:[{value,label}] (2–3) |
| SignalBlock | Section, Text | kicker, title, body |
| TextBlock | Section, Text | body, align |
| ImageBlock | Section, Img | url, alt, caption |
| AgentCardBlock | Section, Row, Column, Img, Text, Link | photoUrl, name, title, bio, phone, ctaUrl, ctaLabel |
| ButtonBlock | Section, Button | label, url, bgColor |
| DividerBlock | Hr | color |
| FooterBlock | Section, Text, Link | companyName, address, websiteUrl |

## Rules
- **NO `"use client"`** — these render both in the browser DOM (canvas) and server `render()` (export). Pure.
- Table-layout only; missing optional props → don't render that bit (tokens are options).

## Acceptance
- `bunx next build` green. Each block renders with its default props from `default-docs.ts` and with props omitted.

## Isolation
One file each. If split across agents, assign disjoint subsets — no shared file. Do **not** create `BlockRenderer.tsx` (that's Task 20).
