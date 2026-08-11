# Tangled.org tool scan — anything generic we could use? (07/26/2026)

Operator asked whether tangled.org (AT-Protocol git forge, alpha, by Tangled Labs Oy) holds
generic tools we could use, move, or combine into a supertool. Swept via crawl4ai (public
pages: stinkpot, gleam, core, blog/spindle-microvm, homepage feed) + operator's logged-in
Chrome session (timeline, Trending panel = the platform's actual top 5).

## Platform shape

- Community ceiling: flagship monorepo `tangled.org/core` = 1.2k stars / 215 forks / 3.0k
  commits. Everything else is 0–369 stars.
- Trending top 5 (07/26/2026): gleam.run/gleam (369, the language compiler),
  aly.codes/tg (53, TUI for tangled itself), giacomocavalieri.me/squirrel (92, type-safe
  SQL **in Gleam**), tangled.org/core (1.2k), hayleigh.dev/at (60, atproto primitives
  **for Gleam**).
- Feed sample (~4h of global activity): Rust libs (surelock deadlock-prevention,
  future_form, evidence), Nix dotfiles/utils, Gleam/atproto ecosystem (gleam-pds),
  Home Assistant voice bridges (wyoming-letta/voxtral), an Excalidraw fork with atproto
  sync (pds.dad/lexidraw, TS), a 2004-era Perl multi-VCS patch tool (commit-patch),
  a Rust SSG (understory).

## Verdict

**Nothing runs in our stack.** Zero TypeScript/Python data tooling in the visible catalog
(lexidraw is TS but is an app fork, not a tool). The platform's center of gravity is
atproto + Gleam/Rust/Nix/Go systems hobbyists. No supertool material; no repo worth
vendoring or porting.

Yield from the whole tangled thread this session:
1. stinkpot → ONE pattern, shipped as Bible §0.4 (timestamp index at birth on append-only
   logs). That's the entire harvest.
2. spindle-microvm post: two practices we already do (fail with underlying logs attached =
   our cron incident auto-capture; name the real failure class = our guard distinctions).
3. Moving our repo there gets zero contributors (closed repo + tiny wrong-audience
   community + our GHA/gh-CLI spine doesn't port). Ruled out 07/26/2026.

Only strategic residue: tangled proves the atproto ecosystem is attracting real projects.
If that matters to us anywhere, it's Bluesky as a *distribution* channel for the social
pipeline — not the forge.
