# SWFL Data Gulf — Design System (Contractor Reference)

Welcome. This folder is everything you need to build the components and landing page.

## Read in this order

1. **`product-brief.md`** — What the product is, who it's for, and the **canonical JSON data shape**. This is also where you'll find the exact mock data to use in your builds.
2. **`motion-rules.md`** — The motion personality. Read this before writing a single animation. Veto list is in here.
3. **`surface-recipes.md`** — Beat-by-beat animation sequence for each surface (report page, landing page, inline widget). Treat as constraints, not suggestions.
4. **`color-and-type.md`** — Full palette with hex values, type scale, spacing tokens.
5. **`quick-reference.md`** — One-page cheat sheet. Keep this open while building.

`globals.css` has all the color tokens as CSS custom properties — copy/paste directly.

---

## Animation library note

Our internal docs reference **Anime.js v4**. Your deliverables use **GSAP + Three.js** — the motion concepts are 1:1. Where the docs mention `createSpring({ stiffness: 90, damping: 14 })`, use the equivalent GSAP spring. Where they say `eases.outQuint`, use `power3.out`. The timings, budgets, and veto rules all apply regardless of library.

---

## Data format

All components are driven by **JSON passed at init**. Full schema is in `product-brief.md`. Example for the scatter plot:

```json
{
  "points": [
    {
      "id": "north-naples",
      "label": "North Naples",
      "capRate": 6.8,
      "vacancy": 4.2,
      "absorption": 12400,
      "category": "A"
    },
    {
      "id": "estero",
      "label": "Estero",
      "capRate": 6.1,
      "vacancy": 5.8,
      "absorption": 9800,
      "category": "B"
    }
  ]
}
```

No hardcoded values in the components. I'll provide all real data before you start.

---

## The one rule above all others

> **Animation reveals data — it does not gate it.** The number is in the DOM from page load. Motion is the flourish on top.

If you're ever choosing between "show the number now" and "perform a reveal," show the number now.
