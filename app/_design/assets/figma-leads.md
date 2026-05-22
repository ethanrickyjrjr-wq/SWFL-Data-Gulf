# Figma resources — leads, not assets

**Honest summary first:** I searched broadly for free / open-source
Figma files that would fit SWFL Data Lake's "premium research firm
with data viz studio soul" aesthetic. **None of what's freely available
fits well enough to attach directly.** Most free Figma dashboard kits
skew SaaS-admin or fintech-app aesthetic — bright accents on light
backgrounds, rounded cards with drop shadows, marketing-deck energy.
That's the opposite of where we're going (deep gulf palette, sharp
financial-adjacent type, no shadows).

**My recommendation:** don't attach a `.fig` file to Claude Design.
Generate the visual system from the spec in this folder. The Figma
resources below are useful **only** as inspiration boards to skim
later, not as a starting point.

## Notable leads (browse manually if curious)

### Closest in vibe (still imperfect)

- **themesberg/figma-admin-dashboard-template**
  <https://github.com/themesberg/figma-admin-dashboard-template>
  Open-source, downloadable `.fig` directly from GitHub releases. Light-
  themed admin dashboard — wrong color palette, but the component
  inventory (tables, charts, modals) is decently exhaustive. Useful
  only if you want a structural reference for what components to design,
  not their look.

- **Horizon UI — Open Source Admin Template**
  <https://www.figma.com/community/file/1098131983383434513/horizon-ui-trendiest-open-source-admin-template-dashboard>
  Figma Community file. "Get a copy" through Figma auth. Modern admin
  dashboard, more polished than themesberg. Same caveat: wrong palette,
  too SaaS-admin.

### Figma Community indexes (browse, don't trust the listings)

- **Figma — Dashboard Design UI**
  <https://www.figma.com/community/ui-kits/dashboards>
  Figma's own curated index of dashboard kits. Mostly paid or paywalled.

- **Figma — 50+ Free Dashboard Design Templates**
  <https://www.figma.com/templates/dashboard-designs/>
  Free templates index. Same skew — SaaS / fintech aesthetic dominates.

### Adjacent (interesting, not actionable)

- **voltagent/awesome-design-md**
  <https://github.com/voltagent/awesome-design-md>
  "A plain-text design system document that AI agents read to generate
  consistent UI. It's just a markdown file. No Figma exports, no JSON
  schemas..." This is essentially the same pattern we just built in
  `app/_design/`. Worth bookmarking as a community parallel; not
  source material to copy.

- **Hope UI** <https://hopeui.iqonic.design/>
  Open-source enterprise admin template. Free download. Same SaaS-admin
  skew.

## Why the freely-available .fig files don't fit

SWFL Data Lake is positioned as **"premium research firm with data viz
studio soul."** The aesthetic palette is:

- Deep, near-black backgrounds with blue-green undertone
- Saturated-but-not-neon gulf teal accent
- Off-white warm text, never clinical white
- Sharp financial-adjacent display type
- Tabular figures everywhere
- Borders, never drop shadows
- One signature reveal, then stillness

Free Figma dashboard kits — almost universally — use:

- Light backgrounds or generic dark mode
- Vibrant SaaS-purple / fintech-green accents
- System fonts or generic sans
- Lots of rounded cards with drop shadows
- Brand mascot illustrations and stock icons
- Animated chart loops and pulsing dots

The two aesthetics don't compose. Pulling a free admin kit into Claude
Design's reference set would push the output toward "another SaaS
admin app," which is what we explicitly aren't.

## If you want a .fig file later

Three realistic paths:

1. **Commission one.** Once SWFL Data Lake has a name and the report
   page lives in production, brief a Figma freelancer to build the
   design system file from this folder's specs. ~2-5 days of work.
2. **Reverse-build from production.** After Claude Design ships the
   first surfaces, capture screenshots and recreate as Figma frames
   for future stakeholder review. Lower cost; mostly a documentation
   exercise.
3. **Buy Untitled UI or similar premium kit and re-skin.** $200-400
   one-time. Skip the SaaS-admin skin entirely; use only the component
   geometry. Then apply the gulf palette and type system from
   `app/_design/05-color-and-type.md`.

For now: generate from the spec.
