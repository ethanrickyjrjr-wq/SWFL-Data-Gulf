// lib/deliverable/recipes/just-sold.ts
//
// R5 · JUST SOLD — the same resolved house, now closed. Set the close among the
// week's real sales nearby, and end with a private home-valuation offer.
//
// ── IT WEARS THE CAMPAIGN CHROME (07/13/2026) ────────────────────────────────────
//
// This file used to own its own grid: header · photo · hero(LEFT) · stats[3] ·
// stats[3] · text · list. Six sibling recipes each owned a DIFFERENT one, so a
// subscriber walking Coming Soon → Sold got seven emails that looked like seven
// different companies. The layout now lives in ONE place — `buildLifecycleEmail`
// (lib/email/lifecycle-chrome.ts) — and this recipe supplies only what legitimately
// differs: the RIBBON WORD, the hero numbers, the spec cells, its own MIDDLE
// (the comps bar + the sold-comps list), and the CTA. It does not get a shape.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — the same house as New Listing, resolved ONCE by the dispatcher
//      (ctx.facts). NO SECOND RESOLVER.
//   2. SKELETON — none of its own. `buildLifecycleEmail`, the campaign chrome.
//      Brand (globalStyle, header, agent card, footer) is lifted from the canvas.
//   3. CELLS — the CLOSE PRICE is the hero. It is the one number this email exists
//      for, and it is the one number the vendor does not sell us. A recorded sale
//      fills it when we hold one; otherwise it is PREFILLED from the last list price
//      we hold and the agent types over it (decree 08/06/2026 — see `heroPrice`).
//      Never a zero, and never from an old recorded transfer.
//   4. CHART — comps-bar, and ONLY when the close is RECORDED. The subject's own bar
//      IS the point ("set the close among the week's real sales"); a bar chart of
//      six neighbours with no subject bar is an AREA chart on a listing email —
//      exactly the failure playbook rule 3 names. **A PREFILL IS NOT A BAR** — a
//      baked PNG carries no label and cannot be edited, so the one number the agent
//      would fix is the one number they cannot reach. No recorded close → no chart
//      at all (the chrome only positions the middle blocks it is handed, so there is
//      no empty slot left behind), and the sold-comps LIST still carries the context.
//   5. PROSE — the house's own facts + the agent's pasted description, with the
//      close (when sourced) and the nearby sales as BACKGROUND. Never a pitch.
//   6. FRAMING — "Just Sold" ribbon, the address over the CLOSE, a private
//      home-valuation CTA (the NEXT action — never "see the sale price" on an email
//      whose whole job is the sale price).
//
// ── THE CLOSE-PRICE PROBE (live, 07/13/2026 — the honest answer this recipe owes) ─
//
// The vendor gives us a LIST price for an ACTIVE listing. A SOLD price is a
// different thing, and it is NOT the same field:
//
//   • resolveSubjectListing() reads the FOR-SALE `/search` feed, so `facts.price` is
//     the last LIST price we hold (`listing_state.list_price`, lib/listings/select.ts:264).
//     ** AMENDED 08/06/2026 BY OPERATOR DECREE. ** This file used to call that an ASK and
//     declare it FORBIDDEN, leaving the hero EMPTY in the common case. Verbatim: *"SOLD
//     PRICE IS ENTERED AS LAST LISTED PRICE WE HAVE. USER CAN CHANGE IT IF THEY WANT."*
//     It is a PREFILL in an EDITABLE cell, not an assertion — lane 1 with lane 4 on top.
//     What it may never do is leak into a DERIVED, CHARTED, FOOTNOTED or WRITTEN cell,
//     none of which are editable. See `heroPrice`. `ListingFacts` still carries no sold
//     price, no sold date, and no propertyId.
//
//   • `fetchSoldEvent(propertyId)` (/property-tax-history) DOES return a real
//     recorded sale — but it is the property's LAST RECORDED TRANSFER, whenever
//     that was. Probed live against the known-good fixture: 326 Shore Dr is ACTIVE
//     at $595,000 and its tax history returns {soldPrice: 160000, soldDate:
//     "2023-03-17"} — a 2023 land/teardown transfer (the row is
//     `is_new_construction: true`). Rendering that as "Just Sold — $160,000" over a
//     house asking $595,000 is the exact trap this recipe had to find. A real
//     source is not the same as a source-faithful answer.
//
// SO: the only RECORDED close is the subject's OWN row in its OWN nearby-SOLD set,
// carrying a real sale (priceKind === "sold" — a /property-tax-history Sold event).
// A property is the nearest property to its own coordinates, so a genuinely sold
// subject comes back in its own comp set (the same trick withBaths() uses). An
// `estimate` (AVM) or a `last_list` is NOT a sale and can never be treated as one.
//
// Everything else → the hero PREFILLS from the last list price we hold, editable,
// and the agent types the real number over it. County recording lags by weeks, so
// that is the COMMON case, not the edge case — which is exactly why an empty hero
// was the wrong answer. Nothing held at all → an open slot ("" — a canvas
// placeholder, absent from the sent email), never a zero.
//
// THE PAID RUNG IS OFF. Decree 08/06/2026: *"APIFY IS FALL BACK FOR SOLD PRICE. WE
// WILL NOT USE IT UNTIL WE SEE THERE IS AN ACTUAL DIFFERENCE. I WILL DECIDE."* A
// date-ranged paid sold pull would fill this cell for ~$0.01/home; it is NOT wired
// here on purpose, and `just-sold.test.ts` fails if such an import ever appears.
//
// ── LANDMINES HONORED ────────────────────────────────────────────────────────────
// • A COMP MUST HAVE beds AND sqft, OR IT IS A VACANT LOT. Confirmed live in this
//   subject's own sold set: 315 Shore Dr — beds null, sqft null, lotSqft 16640,
//   $127,500. Charting bare land against a 2,847 sqft house makes the close look
//   like a steal for a fake reason. Filter BY DATA, never by guessing at the name.
// • The subject is excluded from its own comp set (it is never its own comp).
// • THE PAIRING RULE — see `soldSpecs`. A price cell that is not the close may only
//   appear ALONGSIDE the close, never instead of it.

import { withCommas } from "@/lib/format-number";
import { compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import { canonStreet } from "@/lib/listings/resolve-subject";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import { chartImageBlock } from "@/lib/email/inject-chart";
import { soldCompsListBlock } from "@/lib/email/sold-comp-blocks";
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";
import { addressLineOf, pricePerSqft, spec } from "@/lib/email/listing-flyer";
import { authorListingNarrative, clearNarrativeSlots, fillNarrative } from "./shared";
import { justSoldSubject } from "./subject-lines";
import type { RecipeBuildContext } from "./index";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** A recorded sale of the SUBJECT itself — the only thing that may fill the close. */
interface SubjectClose {
  price: number;
  /** ISO date of the recorded sale; null when the event carried none. */
  date: string | null;
}

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** "2026-05-20" → "05/20/2026" (Rule 5: MM/DD/YYYY, never the raw token). */
function isoToMDY(iso: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/** The street line of an address — everything before the first comma. */
function streetOf(address: string | undefined): string {
  return (address ?? "").split(",")[0]?.trim() ?? "";
}

/** Digits of a money/number string → a positive number, else null. */
function num(s?: string): number | null {
  const n = Number((s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The REAL SALES nearby — the context a close is set among. Three filters, each
 * learned the hard way:
 *
 *  1. beds AND sqft, OR IT IS A VACANT LOT. Confirmed live in this very subject's
 *     sold set: 315 Shore Dr — beds null, sqft null, lotSqft 16640, $127,500.
 *     Charting bare land against a 2,847 sqft house makes the close look like a
 *     steal for a fake reason. Filter BY DATA, never by guessing at the name.
 *  2. priceKind === "sold" — A RECORDED SALE, not an AVM. The comp set mixes in
 *     `estimate` (realtor.com AVM) and `last_list` rows; those are NOT sales. This
 *     email's entire credibility is "here is what homes actually CLOSE for here",
 *     and an estimate under a "Recent sales nearby" heading quietly spends that
 *     credibility. `soldCompsListBlock` labels them "est.", so no single row lies —
 *     but the SECTION would. Sold-only makes the heading true of every row.
 *  3. Never the subject itself — a house is not its own comp.
 *
 * COST, and it is real: compsForAddress enriches at most TWO comps with their exact
 * recorded sale (`Math.min(deps.enrichN ?? 2, 2)` — a hard cap that keeps the whole
 * request to ≤3 vendor calls), so this can surface at most 2 real sales. Reported.
 */
export function realSaleComps(comps: RenderComp[], subjectStreet: string): RenderComp[] {
  const self = canonStreet(subjectStreet);
  return comps.filter(
    (c) =>
      c.beds != null &&
      c.sqft != null &&
      c.price != null &&
      c.priceKind === "sold" &&
      (!self || canonStreet(c.addressLine) !== self),
  );
}

/** The subject's OWN row inside its OWN nearby set. A property is the nearest
 *  property to its own coordinates, so it comes back in its own comp set — the same
 *  trick withBaths() uses to get a bath count off /nearby-home-values. */
export function subjectRow(comps: RenderComp[], subjectStreet: string): RenderComp | null {
  const self = canonStreet(subjectStreet);
  if (!self) return null;
  return comps.find((c) => canonStreet(c.addressLine) === self) ?? null;
}

/**
 * The subject's OWN recorded sale, or null. The ONLY honest source of a close price
 * (see the header). `priceKind === "sold"` is a /property-tax-history Sold event; an
 * AVM `estimate` or a `last_list` is NOT a sale and may never fill this cell.
 */
export function closeFrom(row: RenderComp | null): SubjectClose | null {
  if (!row || row.priceKind !== "sold" || row.price == null) return null;
  return { price: row.price, date: row.priceDate };
}

/** What the hero cell carries, and WHICH RUNG of the decree's ladder filled it. */
export interface HeroPrice {
  /** Rendered verbatim into the hero. "" = an open slot (a canvas placeholder, nothing sent). */
  value: string;
  rung: "recorded" | "prefill" | "open";
  /** The one accent line above the address. ONLY ever a recorded sale's recorded date. */
  kicker: string | undefined;
}

/**
 * THE CLOSE CELL — OPERATOR DECREE 08/06/2026.
 *
 * Verbatim: *"SOLD PRICE IS ENTERED AS LAST LISTED PRICE WE HAVE. USER CAN CHANGE IT IF
 * THEY WANT."* The cell is PREFILLED and it is EDITABLE. Our data is the starting value;
 * the agent who just closed the house puts the final one in.
 *
 * THE LADDER, and which rungs are live:
 *   1. A real recorded sale of the subject itself (`closeFrom` — a /property-tax-history
 *      Sold event that came back inside the subject's own nearby set). Free, already bought.
 *   2. A date-ranged paid pull — **SUSPENDED 08/06/2026 by operator decree**: *"APIFY IS
 *      FALL BACK FOR SOLD PRICE. WE WILL NOT USE IT UNTIL WE SEE THERE IS AN ACTUAL
 *      DIFFERENCE. I WILL DECIDE. NOT STUPID CLAUDE."* Not wired here, deliberately. Turning
 *      it on is his call, made against a measured difference — not a build-time judgement.
 *   3. **The last list price we hold** — `facts.price`, which IS `listing_state.list_price`
 *      (`lib/listings/select.ts:264`). The normal case, because county recording lags weeks.
 *   4. The agent's own number, typed over whatever was prefilled. Always available, always wins.
 *
 * AN EARLIER DESIGN LEFT THIS CELL EMPTY when no recorded sale existed, on the reasoning
 * that a list price under a JUST SOLD ribbon is a lie. That was struck by the decree and it
 * was wrong: a prefilled, labelled, editable field is not a claim the system asserts, and an
 * empty hero on the email whose entire job is one number is not more honest — just useless.
 *
 * WHAT THE PREFILL MAY NEVER TOUCH, and why the rung is returned rather than just a string:
 * everything DERIVED, CHARTED, FOOTNOTED or WRITTEN INTO PROSE. None of those are editable
 * and none carry their own label, so a prefill reaching them stops being a starting value
 * and becomes an assertion. `soldSpecs`, `soldFootnote`, `chartAnchor` and
 * `soldNarrativeLine` all take the RECORDED close and nothing else.
 *
 * STILL FORBIDDEN, and it is a different mechanism: never fill this from the property's LAST
 * RECORDED TRANSFER (`fetchSoldEvent`). Probed live 07/13/2026 — a house ACTIVE at $595,000
 * returns a 2023 land/teardown transfer of $160,000. That is not a stale starting value an
 * agent notices; it is a plausible wrong number from a different decade.
 */
export function heroPrice(facts: ListingFacts, close: SubjectClose | null): HeroPrice {
  if (close) {
    const on = isoToMDY(close.date);
    return { value: usd(close.price), rung: "recorded", kicker: on ? `Sold ${on}` : undefined };
  }
  // VERBATIM — never round-tripped through a formatter. The agent has to recognize their own
  // number to decide whether to leave it, and `$595,000` → `$595000` is how you hand back a
  // number that is no longer theirs.
  const listed = (facts.price ?? "").trim();
  if (listed) return { value: listed, rung: "prefill", kicker: undefined };
  return { value: "", rung: "open", kicker: undefined };
}

/**
 * THE CHART'S ANCHOR — a recorded close, or no chart at all.
 *
 * A prefill is never a bar. A baked PNG bar carries no label, no provenance row and no
 * editability, so it is the one element on the page the agent cannot correct — plotting a
 * list price bar-for-bar against RECORDED sales is the same mechanism the header forbids for
 * an old transfer, with the correction path removed.
 */
export function chartAnchor(close: SubjectClose | null): number | null {
  return close ? close.price : null;
}

/**
 * WHAT THE NARRATOR IS TOLD ABOUT THE PRICE. Prose is baked at author time and is NOT
 * editable, so a prefill the agent will fix in the cell would survive uncorrected inside the
 * paragraph. No recorded close → the model is forbidden to name any sale price at all,
 * including the ask sitting right there in the facts.
 */
export function soldNarrativeLine(close: SubjectClose | null): string {
  if (!close) {
    return (
      `This home has SOLD. THE CLOSING PRICE IS NOT AVAILABLE TO YOU — do not state, estimate, ` +
      `or imply any sale price, and do NOT present the "List price" in the facts as the sale price ` +
      `(it is the ask). Write about the home itself and the fact that it is sold.`
    );
  }
  const on = isoToMDY(close.date);
  return (
    `This home has SOLD. It closed at ${usd(close.price)}${on ? ` on ${on}` : ""}. ` +
    `The closing price is the headline — the "List price" in the facts is what it was ASKING, not what it sold for.`
  );
}

/**
 * THE SOLD-SUBJECT GAP, and the fact we were already fetching and throwing away.
 *
 * The dispatcher's resolveSubjectListing() reads the FOR-SALE `/search` feed — so a
 * house that has actually SOLD is not in it, and `ctx.facts` for the one case this
 * recipe exists for comes back address-only: no beds, no baths, no sqft, no photo.
 * Probed live (330 Shore Dr, closed $300,000 on 08/29/2025): every spec cell empty.
 *
 * But the subject's OWN row in the sold set carries beds/baths/sqft — on
 * /nearby-home-values, an endpoint THIS BUILDER ALREADY CALLS. That is exactly the
 * `baths` lesson from the playbook: the cells rendered empty over data we held.
 *
 * This is NOT a second resolver (playbook rule 1). The subject was resolved once, by
 * the dispatcher; this only FILLS GAPS it left, from a call already made, using the
 * subject's own vendor row. A value the dispatcher DID resolve is never overwritten.
 */
export function withSubjectRowFacts(facts: ListingFacts, row: RenderComp | null): ListingFacts {
  if (!row) return facts;
  const str = (n: number | null) => (n != null ? String(n) : undefined);
  return {
    ...facts,
    beds: facts.beds ?? str(row.beds),
    baths: facts.baths ?? str(row.baths),
    sqft: facts.sqft ?? str(row.sqft),
    city: facts.city ?? (row.city || undefined),
  };
}

/**
 * THE SPEC STRIP — the campaign's ONE hairline row, wearing the sold hat.
 *
 * The chrome gives every lifecycle email the same strip; what differs is WHICH CELLS
 * and which one wins the argument. On a sold email that is LIST-TO-SALE (primary, in
 * the accent): it is the only number here the hero has not already said, and it is
 * the whole reason a farm list opens this. The ask is `muted` — it is context to the
 * close, not a headline of its own.
 *
 * THE CLOSE IS NOT IN THE STRIP. The hero carries it. The previous layout put it in
 * a stat row directly beneath the hero and printed the same $300,000 twice, at the
 * same scale — a bug the HTML greps clean for and only the screenshot shows.
 *
 * ── THE PAIRING RULE (found by LOOKING at the render, 07/13/2026) ────────────────
 * A PRICE CELL THAT IS NOT THE CLOSE MAY ONLY APPEAR ALONGSIDE THE CLOSE. With the
 * close unsourced and the ask known, the open-slot contract correctly dropped the
 * empty sale cell — which left "$595,000 / List Price" standing alone under a gold
 * JUST SOLD ribbon. Every word on the page was true and the page still said the
 * house closed at its asking price. So `List Price` and `List-to-Sale` are
 * all-or-nothing on the PAIR: no close → three open slots on the canvas (the agent
 * knows both numbers) and NO price cells in the sent email. An element ships with
 * its coherence rule; this is it.
 *
 * $/SQ FT IS THE SALE PRICE ÷ SQUARE FEET — never the ask ÷ square feet. A sold
 * email's $/sq ft is a claim about what the market PAID. Two sourced figures in, one
 * rate out (the same shape as the flyer's), never back-solved from one of them.
 */
export function soldSpecs(facts: ListingFacts, close: SubjectClose | null): StatItem[] {
  const listPrice = num(facts.price);
  const pair = close && listPrice ? { close: close.price, list: listPrice } : null;
  // Derived from the CLOSE, or not at all. `pricePerSqft` parses digits out of both.
  const soldPerSqft = close ? pricePerSqft(usd(close.price), facts.sqft) : undefined;
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(soldPerSqft, "$/Sq Ft"),
    spec(pair ? usd(pair.list) : undefined, "List Price", "muted"),
    spec(
      pair ? `${Math.round((pair.close / pair.list) * 1000) / 10}%` : undefined,
      "List-to-Sale",
      "primary",
    ),
  ];
}

/**
 * THE ACCENT THE EMAIL WILL ACTUALLY WEAR — which is NOT always the canvas's.
 *
 * `buildLifecycleEmail` owns the brand decision: a real user brand rides through
 * untouched, while a still-default (blank) brand gets the editorial palette. The
 * chart PNG is baked BEFORE that call, so passing `currentDoc.globalStyle.accentColor`
 * bakes the CANVAS's accent — and on a blank brand that is the house teal, under a
 * GOLD "Just Sold" ribbon. Found by screenshotting the render, 07/13/2026: teal bars,
 * gold everything else. The "seven companies" disease, at element scale, inside one email.
 *
 * So ASK THE CHROME rather than copying its palette here — one authority per shared
 * concept. A throwaway build with empty chrome is a pure function call; it costs
 * nothing and can never drift from whatever the chrome decides next.
 */
function chromeAccent(current: EmailDoc): string {
  const probe = buildLifecycleEmail(current, {
    ribbon: "",
    photo: null,
    heroValue: "",
    heroLabel: "",
    specs: [],
    ctaLabel: "",
  });
  return probe.globalStyle.accentColor ?? "#2563eb";
}

/** Provenance for the DERIVED cells, stated where the reader can see it. Names only
 *  the cells that actually rendered — a footnote for a cell that is an open slot is
 *  itself a claim that something was computed. */
export function soldFootnote(facts: ListingFacts, close: SubjectClose | null): string | undefined {
  const parts: string[] = [];
  if (close && pricePerSqft(usd(close.price), facts.sqft)) {
    parts.push("$/Sq Ft is the sale price ÷ listed square footage");
  }
  if (close && num(facts.price)) parts.push("List-to-Sale is the sale price ÷ the list price");
  return parts.length > 0 ? `*${parts.join("; ")}.` : undefined;
}

/**
 * The comps bar — the close set among the week's real sales. The SUBJECT'S OWN BAR
 * is what makes this a chart about the subject rather than about the area, so it is
 * required: no close → no chart (the caller omits it from the middle entirely).
 */
export function buildJustSoldSpec(
  comps: RenderComp[],
  subject: { street: string; close: number },
  asOfIso: string,
): ChartSpec | null {
  // Under two comps a bar chart says nothing — the same floor the sold-comps chart
  // uses. Every row here is already a priced, real, RECORDED SALE (realSaleComps),
  // so no "(est.)" honesty suffix is needed: there is nothing to disclaim. Bar for
  // bar, this chart compares a close against closes.
  if (comps.length < 2) return null;
  // THE MARKER GOES FIRST — barChartSvg (lib/email/chart-image.ts) truncates a bar
  // label at 26 chars and right-anchors it, so a trailing marker is exactly what
  // gets eaten: "326 Shore Dr (Subject — sold)" (29) rendered as
  // "26 Shore Dr (Subject — s…" — clipped on the left AND stripped of the one word
  // that makes this chart about the subject. Verified by screenshotting the SVG.
  // Leading it means a long street loses its tail instead, and the subject bar is
  // always identifiable. "This home" over "Subject" — plain speech, no jargon.
  const rows: (string | number | null)[][] = [
    [`This home · ${subject.street}`, subject.close],
    ...[...comps]
      .sort((a, b) => (b.price as number) - (a.price as number))
      .map((c) => [c.addressLine, c.price]),
  ];
  return {
    frameId: "bar-table",
    title: `${subject.street} sold — and what sold near it`,
    columns: ["Property", "Price"],
    rows,
    value_format: "usd",
    chart_type: "bar",
    asOf: asOfIso,
    source: { citation: "SWFL Data Gulf · realtor.com", url: "https://www.realtor.com" },
  } as ChartSpec;
}

export async function buildJustSold(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts: resolved, currentDoc } = ctx;
  // No subject → nothing to announce as sold. Fall through to the generic author
  // rather than shipping an empty sold flyer (never refuse; never fake a house).
  if (!resolved) return null;

  const street = streetOf(resolved.address);

  // ── The real sales nearby — the CONTEXT this email sets the close among. ONE call
  // (geocode → nearby SOLD → ≤2 exact-sale enrichments). Best-effort: any miss ships
  // the email without the comps, never blocks the build (RULE 0.7).
  const compRes = resolved.address
    ? await compsForAddress(resolved.address).catch(() => null)
    : null;
  const allComps = compRes?.comps ?? [];

  // The subject's own row — read BEFORE the comps are filtered, because the subject
  // is deliberately removed from its own comp set. It carries two things the
  // for-sale-feed resolver could not: the recorded CLOSE, and (for a genuinely sold
  // house) the specs. Both come from a call we already make.
  const self = subjectRow(allComps, street);
  const close = closeFrom(self);
  const facts = withSubjectRowFacts(resolved, self);

  // Vacant lots out, AVM estimates out, the subject out. See realSaleComps.
  const comps = realSaleComps(allComps, street);

  // ── THE MIDDLE — the only place this email legitimately differs from its siblings.
  const middle: ChromeBlock[] = [];

  // CHART — comps-bar, and ONLY with the subject's own bar. Without the close there
  // is no subject bar, and six neighbours' sales on a listing email is an AREA chart
  // — the failure rule 3 names. No close → the chart is never built, so there is no
  // empty box to drop (the chrome positions only the blocks it is handed). The comp
  // LIST below still carries the context honestly. (A chart PNG is baked at author
  // time, so a close typed into the open slot later cannot retroactively enter it —
  // reported as a known limitation.)
  const anchor = chartAnchor(close);
  const chartSpec = anchor
    ? buildJustSoldSpec(
        comps,
        { street: street || "This home", close: anchor },
        new Date().toISOString().slice(0, 10),
      )
    : null;
  if (chartSpec) {
    const chartImg = await chartSpecToEmailImage(
      chartSpec,
      // The accent the CHROME will land on — never the canvas's. See chromeAccent.
      chromeAccent(currentDoc),
      `just-sold-${facts.zip ?? "swfl"}-${Date.now()}`,
    ).catch(() => null);
    // An empty chart box is worse than no chart — a failed render simply doesn't ride.
    if (chartImg) middle.push({ block: chartImageBlock(chartImg), height: 6 });
  }

  // THE WEEK'S REAL SALES, as linked rows. Vacant-lot-filtered, subject excluded.
  const compRows = soldCompsListBlock(comps);
  if (compRows) middle.push({ block: compRows, height: 5 });

  // THE CLOSE CELL — decree 08/06/2026. A recorded sale if we hold one, else our last list
  // price as an EDITABLE PREFILL, else an open slot. See `heroPrice`.
  const hero = heroPrice(facts, close);
  const footnote = soldFootnote(facts, close);

  // ── THE CAMPAIGN CHROME. One layout, seven emails, one agent.
  let doc = buildLifecycleEmail(currentDoc, {
    ribbon: "Just Sold",
    // The photo of the win. A genuinely SOLD house is not in the for-sale feed, so it
    // often has none → an OPEN SLOT: a dropzone on the canvas, absent from the sent
    // email. Never stock art, never a refusal.
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: facts.address ?? "The home that just sold",
          linkUrl: facts.sourceUrl,
        }
      : null,
    // THE CLOSE — a recorded sale, else our last list price PREFILLED and editable
    // (decree 08/06/2026), else "" (an open slot: a canvas placeholder, nothing sent).
    heroValue: hero.value,
    heroLabel: addressLineOf(facts),
    // The one accent line above the address: WHEN it sold. Only ever the recorded date of
    // a RECORDED sale — a prefill gets no kicker, because a date line is not editable and
    // would ship a claim the agent cannot correct.
    ...(hero.kicker ? { heroKicker: hero.kicker } : {}),
    // *** NO DESCRIPTION BLOCK ON THIS EMAIL. THIS IS A DELIBERATE OMISSION. ***
    //
    // Every sibling on this chrome ships `listingDescription(facts.remarks)` — the seller's
    // own words, verbatim, in their own reserved block. Just Sold must not, and the reason
    // is the ELEMENT COHERENCE RULE, not tidiness.
    //
    // MEASURED 08/06/2026, BY WIRING IT UP AND LOOKING AT THE RENDER. The provenance table
    // said "Description (verbatim) — 549 chars", so the missing block looked like a plain
    // bug; it was added in one line. What then appeared on the page, under a gold JUST SOLD
    // ribbon, was the ACTIVE LISTING'S SALES PITCH, verbatim and unfixable:
    //
    //     "Best-priced single-family home in the community — don't miss this opportunity
    //      to enjoy the Southwest Florida lifestyle!"
    //
    // A for-sale pitch is STALE THE MOMENT THE HOUSE CLOSES. Urging a reader not to miss a
    // home that is already gone is incoherent to them, and we may not fix it by editing the
    // seller's copy — verbatim means verbatim (that is the whole point of the block). The
    // element and the headline cannot both be right, so the element does not ship. Under
    // Contract keeps it because PENDING is not SOLD; that is a different fact.
    //
    // The 50–125-word floor is still met without it: the authored paragraph runs ~68 words
    // on the acceptance house. `just-sold.test.ts` asserts this omission so a future session
    // does not "fix" it back. NO TEST FOUND THIS AND NO TEST COULD — the screenshot did.
    specs: soldSpecs(facts, close),
    ...(footnote ? { specFootnote: footnote } : {}),
    middle,
    // The narrator's slot is left OPEN here and authored into below (fillNarrative
    // SKIPS a text block that already has content).
    narrative: "",
    // THE NEXT ACTION. Never "See the Sale Price" on the email whose whole job is the
    // sale price — the valuation offer IS why a sold email goes to a farm list.
    ctaLabel: "What's My Home Worth?",
    ...(facts.sourceUrl ? { ctaUrl: facts.sourceUrl } : {}),
  });

  // ── PROSE. The model writes prose and nothing else. The close rides in the FRAMING
  // (so the paragraph may state it) and the nearby sales ride in as BACKGROUND. When
  // we have no close, the narrator is explicitly forbidden from naming a sale price —
  // otherwise the ask ($595,000) is right there in the facts and reads like a close.
  // A PREFILLED HERO DOES NOT UNLOCK THE PROSE. `soldNarrativeLine` takes the RECORDED
  // close only: the paragraph is baked and uneditable, so a number the agent will correct
  // in the cell would survive uncorrected inside the sentence.
  const soldLine = soldNarrativeLine(close);
  const context =
    comps.length > 0
      ? `Real recorded sales near this home (background only — do not list them back):\n` +
        comps
          .slice(0, 6)
          .map(
            (c) =>
              `- ${c.addressLine}: ${usd(c.price as number)}` +
              `${c.beds != null ? `, ${c.beds} bd` : ""}` +
              `${c.sqft != null ? `, ${c.sqft.toLocaleString("en-US")} sqft` : ""}`,
          )
          .join("\n")
      : undefined;

  // THE CLOSE, AS A SETTLED FACT — not only as framing. Measured 08/06/2026 on the first
  // acceptance run: the framing named the recorded close and its date, the model dutifully
  // wrote them, and the claim gate threw the WHOLE paragraph away as
  // `unanchored-number("08"), ("29"), ("2025")` — leaving the email whose entire job is one
  // number with ZERO words of body copy, under §1.9's 50–125-word floor. A fact stated only
  // in `framing` is shown but not settled. Anchors are settled. (T8: the drop is a
  // console.error nobody reads and its symptom looks like nothing being wrong.)
  const anchors = close
    ? [
        `Recorded sale price of THIS home: ${usd(close.price)} (a recorded sale, from the county record).`,
        ...(isoToMDY(close.date) ? [`Recorded sale date: ${isoToMDY(close.date)}.`] : []),
        ...(pricePerSqft(usd(close.price), facts.sqft)
          ? [
              `Sale price per square foot: ${pricePerSqft(usd(close.price), facts.sqft)} (already ` +
                `shown in the spec strip above your paragraph — do not restate it as a bare figure).`,
            ]
          : []),
      ]
    : [];

  const narrative = await authorListingNarrative(facts, {
    framing:
      `A JUST-SOLD announcement to the agent's sphere. ${soldLine} ` +
      // NO "end with an offer" CLAUSE. It was here and it cost the paragraph: asked to offer
      // a valuation, the model wrote "if you want to know…" and the gate killed it as
      // `motive("want to")`. The BUTTON already says "What's My Home Worth?" — the CTA is a
      // chrome element, not the narrator's job, and asking prose to duplicate a button is how
      // an instruction and a guard end up fighting each other. (Measured 08/06/2026.)
      `Do NOT write a call to action, an invitation, or an offer of any kind — the email's ` +
      `button already carries it.\n` +
      // The model reliably smuggles a pitch in as market commentary when it is not
      // shut off explicitly: given the price cut it wrote "reflecting the kind of
      // pricing movement that tends to draw serious buyers quickly" — an invented
      // claim about how buyers behave, dressed as analysis. State what happened; say
      // nothing about what it means or what anyone will do next.
      `FORBIDDEN: any claim about what buyers or sellers do, feel, want, or will do; any ` +
      `characterization of the market's behavior, momentum, or direction; any prediction; any ` +
      `word about how fast, how competitive, or how desirable anything is. You are reporting a ` +
      `sale that happened, not interpreting it. If a sentence explains what the facts "reflect", ` +
      `"signal", or "mean", DELETE IT.\n` +
      // House style: dates are MM/DD/YYYY everywhere a user can see them.
      `Write any date exactly as MM/DD/YYYY — never "August 29, 2025".\n` +
      // THE MARKET CLOCK IS NOT A SOLD FACT, and reaching for it kills the paragraph.
      // Measured 08/06/2026 on the prefill run: the model wrote "after 12 days on the
      // market" (gate: `sequence`) and derived a list date, "07/22" (gate:
      // `unanchored-number`). `days_on_market` on the shared fact list is days-in-ACTIVE —
      // the same trap Under Contract documents — and on a house that has sold it is both
      // meaningless and an invitation to narrate a timeline we never handed over.
      `Do NOT mention how long the home was on the market, when it was listed, or any ` +
      `sequence of events. The ONLY date you may write is a recorded sale date, and only ` +
      `if one is stated in the facts.` +
      // THE PREFILL IS NOT IN THE PROSE. With no recorded close the hero may be carrying a
      // PREFILLED list price the agent is about to type over — but the paragraph is baked and
      // cannot be typed over. A dollar figure in prose under a JUST SOLD ribbon reads as the
      // close no matter which cell it came from, so with no recorded sale NO money may appear
      // in the paragraph at all.
      (close
        ? ""
        : `\nWrite NO PRICE FOR THIS HOME — not the list price, not a sale price, not a ` +
          `per-square-foot figure. We hold no sourced sale price for it. (A cost that is ` +
          `clearly labelled as what it is, like a monthly HOA fee, is fine.)`),
    ...(anchors.length ? { anchors } : {}),
    ...(context ? { context } : {}),
  });
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  // THE SUBJECT LINE — deterministic, never model-authored (subject-lines.ts). It was
  // MISSING entirely until 08/06/2026: the acceptance run printed `Subject line: "(none)"`
  // and the send would have fallen back to whatever `deriveEmailDocSubject` scraped off the
  // doc. Four sibling recipes already set theirs here; this one simply never did.
  return { ...doc, subjectVariants: [justSoldSubject(facts.address, facts.city)] };
}
