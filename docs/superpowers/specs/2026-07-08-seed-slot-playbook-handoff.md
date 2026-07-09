# Template Slot Playbook — how to build a starter template

**Date:** 07/08/2026 · **Status:** the rule is settled. Open questions at the bottom.

## THE RULE

> **If a field's right answer depends on real data, leave it empty and put the instruction in the
> label. If it's structure, style, brand, or a button that says "Schedule a Showing," fill it in.**

That's the whole playbook. Everything below is why it works and what it buys you.

---

## Why an empty field is the way you say "the AI fills this"

This isn't a convention we invented — it's what the code already does.

When the lab hands a template to the AI, `docSkeleton` (`lib/email/build-doc.ts:317`) builds the AI's
view of that template by walking the text fields. It **skips any field whose value is an empty
string**:

```
if (props[k] !== undefined && props[k] !== "") text[k] = props[k];
```

It always sends the label. So you get two lanes for free:

- **Value left empty** → the AI never sees that field. It's an open slot.
- **Value filled in** → the AI sees it as *"here's what's currently there"* — and may just keep it.
- **Label always sent** → the label is where you write the **instruction** for what belongs there.

So a label is not a caption. **A label is a note to whoever fills the slot.**

### What that looks like

Filled-in example (a finished demo — the AI sees "6.75%" as the current answer):

```ts
{ value: "6.75%", label: "30-Year Fixed · National Average" }
```

Playbook version (an open slot with an instruction):

```ts
{ value: "", label: "The headline number the chart supports" }
```

The Trend Snapshot template already does exactly this. It's the model to copy.

---

## What you fill in vs. leave open

**FILL IN — things a template legitimately knows:**

- **Structure** — where blocks sit on the 12-column grid (`layout` x/y/w/h), block order, which blocks
  exist. This *is* the template.
- **Style** — backdrop, primary, accent, text colors, font pairing. Sticky; the AI can never rewrite it.
- **Brand** — header/footer/agent identity. Defaults to the house brand, never lorem placeholders.
- **Intent** — every `label`, `caption`, `alt`, written as an instruction to the filler.
- **Non-data scaffolding** — `stats` labels like "Beds"; a button label like "Schedule a Showing".

**LEAVE EMPTY — things only the fill can know:**

- **Every figure** — hero value, stat values, metric values. Any price, percent, or count.
- **Every photo** — property photo, agent photo, listing photo.
- **Every commentary sentence** — the prose, the body, the signal.
- **Every link** — button URLs, CTA URLs. Engine-owned; never authored.

---

## What you don't have to think about

**Charts.** Reserve the slot: place an `image` block with the `layout` you want and an instructional
`alt`/`caption`. When a chart is requested, `upsertChartBlock` (`lib/email/inject-chart.ts`) replaces
that image **in place** — same id, same position — so the chart lands exactly where you put it. No
image block? It inserts after the first hero, else after the header, else appends. It skips
`kind:"photo"`, which is how a photo and a chart coexist in one template.

**Colors.** Nothing to author. `applyBrand` (`lib/email/brand/apply-brand.ts`) overlays the user's
brand onto the template's palette *after* the fill. Your palette is the default their brand overrides.

**Commentary quality.** `voice-guard.ts` strips corporate-AI tells from authored prose in the existing
repair loop — no extra round-trip.

**Missing numbers.** `gap-fill-pass.ts` is four-lane (RULE 0.7): our data → the user's upload → a cited
web source → a figure they hand us. A gap it can't fill becomes an explicit `[Need: x]` request, never
an invented figure.

---

## The machinery you're plugging into

Five stations, all shipped. You author at SHAPE; the rest is automatic.

- **SUPPLY** — `lib/email/doc/block-contract.ts` — which block kinds exist, what's authorable.
- **SHAPE** — `lib/email/doc/default-docs.ts` — `SEED_DOCS`, the starter templates. **You author here.**
- **FILL** — `lib/email/build-doc.ts` — `docSkeleton` → model → `tryParsePatch` → `applyPatch`.
- **INJECT** — `inject-chart.ts` / `inject-photo.ts` — charts and photos into reserved slots.
- **GATE** — `author-doc.ts` no-invention prose lint + `voice-guard.ts`.

`applyPatch` hard-preserves the template's style — the AI fills content into your fixed skeleton and
can never touch brand or layout.

---

## Two prefill systems — know which one you're authoring

There are **two** different ways to prefill, and they answer different questions:

- **A positioned template** (`default-docs.ts`) — real blocks with real grid coordinates. Enforced:
  the blocks literally exist. Answers *where things sit*.
- **A written recipe** (`author-recipes.ts`) — advisory prose appended to the AI's instructions.
  Not enforced; the model may deviate. Answers *what to say, and in what order*.

The distiller emits either one. **Which to author, when, is an open question — see below.**

---

## What we can and can't do today

**Can:** position blocks on a 12-column grid · fill figures from real data by id-selection · inject a
chart into a reserved slot · overlay any brand · lint prose for invented numbers and for AI-tell voice ·
fill a gap from a cited source or mark it as a request.

**Can't yet:** data-bound cells (a stat cell that *names* which figure it wants, instead of the model
choosing). Charts in email are PNG — no animation.

---

## Open questions

1. **Positioned template or written recipe?** When a builder has a look in mind, which do they author?
   Both exist and do different things. This decides the shape of the playbook.
2. **How strict is "open" for prose?** Sample prose ("Describe what makes this home stand out") is
   friendly to a human editing by hand, and it's something the AI may echo. Empty-with-instruction, or
   sample text? Today's templates mix both.
3. **The existing templates** — convert them to the playbook, or split them into "demo" (finished
   examples, for showing the layout) vs "production" (playbook-conformant)?
4. **How they should look** — deferred. The variety axes (span multisets, photo ratio set, border
   treatment, accent budget) are where that lands.

---

## Footnote — the example numbers

Most starter templates carry finished example numbers (Rate Watch shows a 30-year-fixed rate; Year in
Review shows a homes-sold count). **These are examples — that's what a demo template is**, and every
email builder ships them.

One thing to be aware of, from reading the code, not from an observed failure: when the AI fills a
template it returns a patch keyed by block, and if one block's patch fails to parse, `applyPatch`
(`build-doc.ts:362`) passes that block through unchanged — example number intact. And `docSkeleton`
shows a filled-in value to the model as the current answer, which it may keep.

**This has not been observed in a real send, and no one has tested whether an unedited template can
reach one.** It is tracked in `checks` as `seed_static_figures_bypass_invention_gate` — a thing to
verify, not a known bug.

Either way it doesn't change the rule above. A template can't know a number. That's why the number
slot is empty.
