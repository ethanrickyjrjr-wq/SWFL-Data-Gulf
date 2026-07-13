// lib/deliverable/recipes/just-sold.ts
//
// R5 · JUST SOLD — the same resolved house, now closed. Set the close among the
// week's real sales nearby, and end with a private home-valuation offer.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — the same house as New Listing, resolved ONCE by the dispatcher
//      (ctx.facts). NO SECOND RESOLVER.
//   2. SKELETON — the committed "just-sold" grid (SEED_DOCS). Loaded, not rebuilt.
//      It is missing a narrative slot and a CTA, which this builder inserts; see
//      SKELETON GAPS below.
//   3. CELLS — the CLOSE PRICE is the headline. It is the one number this email
//      exists for, and it is the one number the vendor does not sell us. See THE
//      CLOSE-PRICE PROBE below: unsourced → an OPEN SLOT the agent fills, never a
//      list price wearing a sold hat, never a zero.
//   4. CHART — comps-bar, and ONLY when the close is sourced. The subject's own bar
//      IS the point ("set the close among the week's real sales"); a bar chart of
//      six neighbours with no subject bar is an AREA chart on a listing email —
//      exactly the failure playbook rule 3 names. No close → drop the chart, keep
//      the sold-comps LIST (honest context that needs no subject bar).
//   5. PROSE — the house's own facts + the agent's pasted description, with the
//      close (when sourced) and the nearby sales as BACKGROUND. Never a pitch.
//   6. FRAMING — "Just Sold" hero, the close over the address, a private
//      home-valuation CTA.
//
// ── THE CLOSE-PRICE PROBE (live, 07/13/2026 — the honest answer this recipe owes) ─
//
// The vendor gives us a LIST price for an ACTIVE listing. A SOLD price is a
// different thing, and it is NOT the same field:
//
//   • resolveSubjectListing() reads the FOR-SALE `/search` feed. `facts.price` is
//     therefore an ASK. Putting it in a "Just Sold" hero would announce a close
//     that never happened — a real number answering the wrong question. FORBIDDEN.
//     `ListingFacts` carries no sold price, no sold date, and no propertyId.
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
// SO: the ONLY honest close is the subject's OWN row in its OWN nearby-SOLD set,
// carrying a RECORDED sale (priceKind === "sold" — a /property-tax-history Sold
// event). A property is the nearest property to its own coordinates, so a genuinely
// sold subject comes back in its own comp set (the same trick withBaths() uses).
// An `estimate` (AVM) or a `last_list` is NOT a sale and can NEVER fill this cell.
//
// Everything else → the close is an OPEN SLOT: an editable "$0" placeholder on the
// canvas (HeroBlock renders the placeholder only when `scope` is present) and
// ABSENT from the sent email. The agent who just closed the house knows the number;
// county recording lags by weeks, so this is the COMMON case, not the edge case.
//
// ── SKELETON GAPS (reported, not edited — default-docs.ts is not mine) ───────────
// The committed "just-sold" grid has NO text block (so fillNarrative would silently
// drop the authored paragraph) and NO button (so the valuation CTA has nowhere to
// go). This builder inserts both. It also prefills hero.label and hero.prose with
// INSTRUCTIONS ("Say what made this sale notable…") which would ship verbatim to a
// recipient — they are overwritten/cleared here. See the final report.
//
// ── LANDMINES HONORED ────────────────────────────────────────────────────────────
// • A COMP MUST HAVE beds AND sqft, OR IT IS A VACANT LOT. Confirmed live in this
//   subject's own sold set: 315 Shore Dr — beds null, sqft null, lotSqft 16640,
//   $127,500. Charting bare land against a 2,847 sqft house makes the close look
//   like a steal for a fake reason. Filter BY DATA, never by guessing at the name.
// • The subject is excluded from its own comp set (it is never its own comp).

import { compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import { canonStreet } from "@/lib/listings/resolve-subject";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import { chartImageBlock, upsertChartBlock } from "@/lib/email/inject-chart";
import { soldCompsListBlock, upsertSoldCompsBlock } from "@/lib/email/sold-comp-blocks";
import { seedById, createBlock, DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
} from "./shared";
import type { RecipeBuildContext } from "./index";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { EmailBlock, EmailDoc, FontFamily, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** Editorial fallback palette — applied ONLY when the incoming brand is still the
 *  house default (a blank brand). A real user brand carries through untouched.
 *  Mirrors listing-flyer.ts so the lifecycle emails look like one family. */
const EDITORIAL_STYLE = {
  primaryColor: "#0A2A2C",
  accentColor: "#B98F45",
  fontFamily: "BOOK_SERIF" as FontFamily,
  displayFontFamily: "PLAYFAIR_SERIF" as FontFamily,
  textColor: "#23302F",
  backdropColor: "#EFE9DD",
};

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

/** "2847" → "2,847". Undefined in → undefined (an open slot, never a zero). */
function withCommas(n?: string): string | undefined {
  const digits = (n ?? "").replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
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
 * The comps bar — the close set among the week's real sales. The SUBJECT'S OWN BAR
 * is what makes this a chart about the subject rather than about the area, so it is
 * required: no close → no chart (the caller drops the slot).
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

/** Reuse the canvas doc's block of a type (brand/identity is STICKY — never authored). */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

/**
 * THE SALE + THE HOME, as two stat rows. Every cell is sourced or an OPEN SLOT —
 * never a zero, never a naked label (StatsBlock drops an empty cell on emailRender
 * and drops the row when none survive; on the canvas the LABEL is the instruction).
 *
 * ── THE PAIRING RULE (both halves found by LOOKING at the render, 07/13/2026) ────
 * THE SALE ROW IS A COMPARISON ROW. It needs BOTH the close and the ask, or it says
 * nothing the hero has not already said — and StatsBlock renders a LONE surviving
 * cell CENTERED AT HERO SCALE, which is exactly how both of these shipped:
 *
 *  • close unsourced, ask known → the open-slot contract correctly dropped the empty
 *    "Sale Price" cell, which left "$595,000 / List Price" alone, huge, directly
 *    under a gold JUST SOLD kicker. Every word on the page was true and the page
 *    still said the house closed at its asking price. The HTML greps clean — only
 *    the screenshot shows it.
 *  • close sourced, ask unknown (the REAL sold-house case, since the for-sale feed
 *    cannot see a sold home) → the hero showed "$300,000" and the row repeated
 *    "$300,000 / Sale Price" directly beneath it at the same scale. Same number twice.
 *
 * So the row is all-or-nothing on the PAIR: missing either number → three open slots
 * on the canvas (the agent knows both) and NO row in the email. The HERO carries the
 * close on its own regardless. An element ships with its coherence rule; this is it.
 */
export function statRows(facts: ListingFacts, close: SubjectClose | null): StatItem[][] {
  const listPrice = num(facts.price);
  // The comparison exists only when BOTH numbers do. The ratio is a rate over two
  // SOURCED figures (like $/sqft on the flyer) — never back-solved from one of them.
  const pair = close && listPrice ? { close: close.price, list: listPrice } : null;
  const cell = (value: string | undefined, label: string): StatItem => ({
    value: value && value.trim() ? value.trim().slice(0, 24) : "",
    label,
  });
  return [
    [
      cell(pair ? usd(pair.close) : undefined, "Sale Price"),
      cell(pair ? usd(pair.list) : undefined, "List Price"),
      cell(
        pair ? `${Math.round((pair.close / pair.list) * 1000) / 10}%` : undefined,
        "List-to-Sale",
      ),
    ],
    [cell(facts.beds, "Beds"), cell(facts.baths, "Baths"), cell(withCommas(facts.sqft), "Sq Ft")],
  ];
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

  // ── SKELETON — the committed "just-sold" grid, loaded (never rebuilt).
  const seed = seedById("just-sold")?.build();
  if (!seed) return null; // the registry names a skeleton that must exist

  // Brand-or-ours: a real user brand carries through untouched; the editorial
  // palette lands only on a still-default (blank) brand.
  const brandIsHouse = currentDoc.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse
    ? { ...currentDoc.globalStyle, ...EDITORIAL_STYLE }
    : { ...currentDoc.globalStyle };

  const rows = statRows(facts, close);
  const soldOn = isoToMDY(close?.date ?? null);

  const blocks: EmailBlock[] = [];
  let statsEmitted = false;
  for (const block of seed.blocks) {
    switch (block.type) {
      // Brand + identity are STICKY — lift the agent's own header/footer/card.
      case "header":
      case "footer":
      case "agent-card":
        blocks.push(keepOrDefault(currentDoc, block.type));
        break;

      // The photo of the win. Empty when the vendor had none (a genuinely SOLD house
      // is not in the for-sale feed, so it often has none) → an OPEN SLOT: a
      // file-picker dropzone on the canvas, absent from the email. Never stock art.
      case "image":
        blocks.push({
          ...block,
          props: {
            ...block.props,
            url: facts.photos[0] ?? "",
            alt: facts.address ?? "The home that just sold",
            ...(facts.photos[0] ? { linkUrl: facts.sourceUrl } : {}),
          },
        });
        break;

      // The sold hero. value = THE CLOSE, or "" (an editable open slot on the canvas,
      // nothing at all in the email — HeroBlock renders the value only when it has
      // one). NEVER facts.price: that is the ASK, and an ask in a sold hero is a lie.
      //
      // LANDMINE: the committed skeleton prefills `label` and `prose` with
      // INSTRUCTIONS ("Sale price and where it sold", "Say what made this sale
      // notable…"). Those are written for a human filling the canvas — shipped as-is
      // they reach the recipient verbatim. Overwrite the label; clear the prose.
      case "hero":
        blocks.push({
          ...block,
          props: {
            ...block.props,
            kicker: "Just Sold",
            value: close ? usd(close.price) : "",
            label: [street || facts.address, soldOn && `Sold ${soldOn}`]
              .filter(Boolean)
              .join(" · "),
            prose: "",
          },
        });
        break;

      // THE SALE + THE HOME. The skeleton reserves the spec rows; we fill them ONCE.
      // (Expanding `rows` on every stats block the skeleton carries would emit the whole
      // grid once per reserved row — four rows where two belong.)
      case "stats":
        if (!statsEmitted) {
          statsEmitted = true;
          for (const row of rows) {
            blocks.push({ id: createBlock("stats").id, type: "stats", props: { stats: row } });
          }
        }
        break;

      default:
        blocks.push(block);
        break;
    }
  }

  // The skeleton now RESERVES the narrative slot and the CTA (they were genuinely
  // missing when this was written, and the seed card was the poorer for it — a user who
  // picked "Just Sold" from the gallery got a card with nowhere to write and nothing to
  // click). These inserts are the FALLBACK for a canvas that lacks them, not an
  // unconditional append: doing both is how the doc grew two of each.
  if (!blocks.some((b) => b.type === "text")) {
    const cardIdx = blocks.findIndex((b) => b.type === "agent-card");
    const narrativeSlot: EmailBlock = {
      id: createBlock("text").id,
      type: "text",
      props: { body: "", align: "left" },
    };
    blocks.splice(cardIdx === -1 ? blocks.length : cardIdx, 0, narrativeSlot);
  }

  // The valuation offer IS this recipe's CTA (the whole reason a sold email goes to a
  // farm list), so it cannot be optional — but it also must not be doubled.
  if (!blocks.some((b) => b.type === "button")) {
    const footerIdx = blocks.findIndex((b) => b.type === "footer");
    const cta: EmailBlock = {
      id: createBlock("button").id,
      type: "button",
      props: { label: "What's My Home Worth?", url: facts.sourceUrl },
    };
    blocks.splice(footerIdx === -1 ? blocks.length : footerIdx, 0, cta);
  }

  let doc: EmailDoc = { globalStyle, blocks };

  // ── CHART — comps-bar, and ONLY with the subject's own bar. Without the close
  // there is no subject bar, and six neighbours' sales on a listing email is an AREA
  // chart — the failure rule 3 names. Drop the slot; the comp LIST still carries the
  // context honestly. (A chart PNG is baked at author time, so a close typed into the
  // open slot later cannot retroactively enter it — reported as a known limitation.)
  const spec = close
    ? buildJustSoldSpec(
        comps,
        { street: street || "This home", close: close.price },
        new Date().toISOString().slice(0, 10),
      )
    : null;
  if (spec) {
    const chartImg = await chartSpecToEmailImage(
      spec,
      globalStyle.accentColor ?? "#2563eb",
      `just-sold-${facts.zip ?? "swfl"}-${Date.now()}`,
    ).catch(() => null);
    if (chartImg) doc = upsertChartBlock(doc, chartImageBlock(chartImg));
  }
  // An empty chart box is worse than no chart.
  doc = dropEmptyChartSlot(doc);

  // ── The week's real sales, as linked rows. Vacant-lot-filtered, subject excluded.
  const compRows = soldCompsListBlock(comps);
  if (compRows) doc = upsertSoldCompsBlock(doc, compRows);

  // ── PROSE. The model writes prose and nothing else. The close rides in the FRAMING
  // (so the paragraph may state it) and the nearby sales ride in as BACKGROUND. When
  // we have no close, the narrator is explicitly forbidden from naming a sale price —
  // otherwise the ask ($595,000) is right there in the facts and reads like a close.
  const soldLine = close
    ? `This home has SOLD. It closed at ${usd(close.price)}${soldOn ? ` on ${soldOn}` : ""}. ` +
      `The closing price is the headline — the "List price" in the facts is what it was ASKING, not what it sold for.`
    : `This home has SOLD. THE CLOSING PRICE IS NOT AVAILABLE TO YOU — do not state, estimate, ` +
      `or imply any sale price, and do NOT present the "List price" in the facts as the sale price ` +
      `(it is the ask). Write about the home itself and the fact that it is sold.`;
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

  const narrative = await authorListingNarrative(facts, {
    framing:
      `A JUST-SOLD announcement to the agent's sphere. ${soldLine} ` +
      `End with ONE plain clause offering readers a private valuation of their own home.\n` +
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
      `Write any date exactly as MM/DD/YYYY — never "August 29, 2025".`,
    ...(context ? { context } : {}),
  });
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  return doc;
}
