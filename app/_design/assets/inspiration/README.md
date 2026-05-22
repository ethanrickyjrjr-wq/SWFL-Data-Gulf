# Visual inspiration

Four reference screenshots from real-world sites. **Study for taste —
do not copy.** Each captures a specific quality worth borrowing.

## meteo-ashwyn.png (22 KB)

Source: <https://meteo.ashwyn.studio/> (caught at the loading state —
their 3D viz takes 15s+ to fully render)

**What to borrow:**

- Near-black background with subtle warm undertone — close to our
  `--gulf-midnight`
- Single saturated teal accent treated as a brand color, not a button
  state — close to our `--gulf-teal`
- Serif display wordmark on a clean stage — confident, not corporate
- Minimal progress bar (single accent line, no spinner, single status
  word) — a working example of the "no spinners" rule from
  `02-motion-rules.md`

**What NOT to borrow:**

- The serif on the wordmark — our type system specs Inter Display, not
  serif. Reference for confidence-level only.

## pudding-birthday-effect.png (88 KB)

Source: <https://pudding.cool/2025/04/birthday-effect>

**What to borrow:**

- Editorial **big-type confidence.** The headline gets enormous weight
  because it IS the answer. Direct application to our hero verdict
  word — it should feel as inevitable as Pudding's "YOU WILL DIE".
- Body copy that talks like a person, not like a data portal. Voice
  cue for the conclusion sentence on a report page.

**What NOT to borrow:**

- The light background and Pudding's playful sticker brand — wrong mode
  for SWFL Data Lake (we're dark + sharp, not editorial-playful).

## linear-app.png (299 KB)

Source: <https://linear.app>

**What to borrow:**

- Restraint. Linear demonstrates how a dark monochrome surface with a
  single accent and great type can read as more premium than 12-color
  brand systems.
- The product UI preview shows hierarchy discipline — primary content
  centered, secondary information radiating out, nothing fighting.
- Tabular alignment of issue rows is a master class in how to handle
  dense data lists. Direct reference for our Tier 3 audit table.

**What NOT to borrow:**

- Linear's lavender / brand-purple accent. We're gulf teal.
- The "modern SaaS" feel. We're "premium research firm."

## nodal-gg.png (1.5 MB)

Source: <https://nodal.gg/>

**What to borrow:**

- The atmospheric **depth** — gradient + stars implying a system you
  navigate into, not a flat page. Translates to our `--gulf-midnight`
  → `--gulf-deep` subtle gradient, hinting at deep-water depth without
  literalizing it.
- Centered single-action interface as a homepage. A clean way to
  approach the `/connect` install command — one CTA, no distractions.

**What NOT to borrow:**

- Cosmic / consumer brand energy. SWFL Data Lake is for analysts on a
  second monitor, not gamers discovering.

## How to use these in Claude Design

Attach all four to Claude Design's "logos and assets" slot. Pair the
attachment with this instruction:

> "Use these four screenshots as TASTE references, not as design
> targets. The breakdown of what to borrow vs not borrow lives in
> `app/_design/assets/inspiration/README.md`. Composing all four —
> meteo's dark-and-accent, Pudding's big-type confidence, Linear's
> restraint, nodal's depth — should approximate the SWFL Data Lake
> visual system."
