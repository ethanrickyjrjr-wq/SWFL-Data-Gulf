# Round 2 direction — socials look-book

**Date:** 07/11/2026 · **Follows:** `2026-07-11-socials-design-elevation-brief.md` + the Round 1 look-book.
**Read this before designing anything else.**

---

## Round 1 verdict

Round 1 did what it was asked and stopped there. It respected every renderer constraint, it named tokens by role, it flagged its own invented `panel` token instead of sneaking it in, and its **empty states are genuinely good** — three-stat reflowing to 2-up, tip-stack's single tip growing to fill the band, stat-absent keeping the panel and swapping in a supporting line. Keep all of that.

What it did **not** do is get us to "art-directed." Three problems, in order of size.

### 1. Charts. There are none. This is the miss that matters.

The `chart` element already exists in the vocabulary. Not one of the five cards uses it.

A card that says **"$494K, down 7.3%"** is a poster — a realtor with a Canva subscription can make it in four minutes. A card that says **$494K with the twelve-month line running underneath it** is *data intelligence*, and they structurally cannot make that, because they don't have the data. **The trend line IS the product.** It is the single reason anyone would follow this account instead of the other four hundred realtor accounts.

**Round 2 mandate: a data visualization appears on the majority of the templates.** Not as decoration — as the thing the card is *about*. Sparkline under the stat in `stat-hero`. A mini-trend inside each panel in `three-stat`. A real chart is a first-class citizen, not an optional garnish.

### 2. Everything is dark, and the research said the opposite.

Every mockup is #0f1d24 with #1c3340 panels. Dark-on-dark, low internal contrast, and — five times in a row — monotonous.

The reference gallery the brief handed you (current top-performing realtor posts) is dominated by **light, neutral, high-contrast** work: white-and-black, brown-and-white, "neutral modern," marble. And the brief gave you a `surface` token — **`#f0ede6`, sand** — that Round 1 never used once.

**Round 2 mandate: produce a light/sand variant of the system.** It costs zero new primitives. It is the fastest path to not looking like everyone else's dark fintech card, and it matches what actually performs.

### 3. It is the same card five times.

Kicker + accent rule top-left → logo top-right → one rounded panel → watermark. Five times. The "elevation" reduces to *add a rounded rectangle*. No scale contrast between templates, no asymmetry, no full-bleed imagery, no editorial composition.

**Round 2 mandate: at most TWO of the five may use the "headline top-left over one panel" skeleton.** The other three must be compositionally distinct — e.g. a full-bleed image card with the type living *on* the photo, a split/asymmetric card, a card where the number is the hero at massive scale and everything else is subordinate. Vary the scale, the axis, and the weight distribution across the set. The five should look like a *family*, not five prints of one card.

---

## Fixes — non-negotiable

- **`33931` is presented as a stat.** In `three-stat` a ZIP code sits in an accent panel at the same visual weight as $494K and −7.3%. A ZIP is an identifier, not a metric. You wrote "no invented third metric" — correct instinct, wrong fix. The fix is to **fill the slot from our data**, not to promote the label. Real third metrics are supplied below.
- **The listing card invents a property.** "210 Estero Blvd · $625K · 3bd/2ba/1,840 sqft" is not a real listing, and the watermark cites **"MLS."** Two rules broken: no number ships without a real source, and **listing citations always read "SWFL Data Gulf," never a vendor or MLS.** Use the supplied real figures, or mark the photo/price slots as explicitly empty placeholders — never a plausible-looking fake.
- **`headline-cta` watermark prints the brand twice** — "SWFL Data Gulf • as of … • SWFL Data Gulf." Bug.
- **Unsourced claims in tips** ("staged homes sell faster, on average"). If a tip asserts a fact, it needs a source or it should be phrased as guidance, not a statistic.

---

## Real data — plot THIS, invent nothing

All Zillow, as of **05/31/2026**. Home values = Zillow Home Value Index; rents = Zillow Observed Rent Index.

**12-month trend series (use for the sparkline / trend charts).** Monthly typical home value, 05/2025 → 05/2026:

- **Fort Myers:** 331,602 · 326,944 · 322,315 · 318,303 · 315,069 · 312,468 · 310,512 · 309,111 · 308,471 · 308,095 · 307,755 · 306,924 · **305,704** (−7.8% over the year, declining every month)
- **Cape Coral:** 369,733 · 365,308 · 360,906 · 356,848 · 353,690 · 351,356 · 349,735 · 348,653 · 347,954 · 347,571 · 347,077 · 346,360 · **345,347**
- **Naples:** 677,892 · 671,065 · 662,655 · 654,888 · 649,215 · 646,679 · 645,679 · 645,353 · 645,580 · 646,305 · 646,404 · 644,676 · **641,887**

A clean, monotonic, year-long decline is a *great* chart — it tells a real story. Use Fort Myers as the default series.

**Per-ZIP figures (for stats).**
- **33901 Fort Myers** — typical home value **$261,247** (−8.8% yr/yr) · typical rent **$1,558** (−3.2% yr/yr). ← **use this trio for `three-stat`.** Three real metrics, coherent, no ZIP-as-stat.
- **33931 Fort Myers Beach** — typical home value **$494,411** (−7.3% yr/yr) · typical rent **$8,421** (beach/vacation market; no year-over-year available — a good, honest empty-state case).
- **34102 Naples** — typical home value **$1,309,977** (−4.0% yr/yr) · typical rent **$7,848** (+4.8% yr/yr).

Round for display ($261K, $1,558, −8.8%). Every figure above is real and sourced — nothing here needs to be invented, and nothing else may be.

---

## Round 2 deliverable

Same packaging as Round 1 (single scrollable look-book, mockup + spec side by side, square 1080×1080, populated + empty state per template). Carry forward everything that worked. Then:

1. Charts on the majority of templates, plotting the real series above.
2. A light/sand variant of the system (`surface` #f0ede6).
3. Compositional variety — max two cards may share the one-panel skeleton.
4. All four fixes above.

Still queued for later rounds, unchanged: the carousel shell (highest engagement of any Instagram post type), the remaining three formats, and the X 16:9 gap.

**The bar:** a stranger scrolling past should be able to tell, in half a second and without reading a word, that this account has data nobody else has.
