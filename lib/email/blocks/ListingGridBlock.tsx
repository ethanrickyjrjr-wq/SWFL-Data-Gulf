// lib/email/blocks/ListingGridBlock.tsx — PURE. ONE category section: a header, an
// optional city subtitle, and a 2-across grid of real listing cards.
//
// WHY THIS EXISTS AS A BLOCK: EmailDoc is capped at 20 blocks (schema.ts). A
// block-per-home layout costs 6 blocks per category and tops the email out at 3
// categories with no hero and no closing CTA. One block per category makes a
// 5-category digest ~9 blocks. See the design spec, §1.
//
// LAYOUT: the Cerberus fluid-hybrid pattern, copied from MultiColumnBlock rather
// than reinvented — each card is an inline-block div at width:100% capped by
// max-width, so two sit side by side on a wide canvas and wrap to one column on
// mobile with no media query. The `fontSize: 0` wrapper kills the whitespace gap
// between inline-blocks; each card resets its own font-size. Degrades to stacked in
// desktop Outlook (which ignores inline-block) — the accepted degrade, same as
// multi-column.
//
// CTA: `ctaLabel`/`ctaUrl` render only for a HAND-BUILT palette grid. The
// listings-digest recipe leaves them unset — emails.md §0.1 is "ONE CTA per email.
// Never three," and five categories with per-section CTAs would ship six
// (operator decision 08/03/2026). Every card still links to its own listing.
//
// Every field is listing-sourced. The AI content-patch never writes a price or a
// photo (no-invention moat) — same fence as ListingBlock.
import { Section, Img, Text, Link } from "@react-email/components";
import type { EmailGlobalStyle, ListingGridCard, ListingGridProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { text, pad, space, WEIGHT } from "./scale";
import { isDarkBg, legibleInk, legibleAccent, ON_DARK_BODY, ON_DARK_MUTED } from "./on-dark";

/** Status-dot colors. Sold red matches the lifecycle chrome; the green is only ever
 *  shown beside a vendor-stated status, never inferred. */
const TONE = { active: "#1c8a4a", sold: "#c0272d" } as const;

export function ListingGridBlock({
  props,
  globalStyle,
}: {
  props: ListingGridProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const bg = props.sectionBg ?? CARD_BG;
  const onDark = isDarkBg(bg);
  const cards: ListingGridCard[] = props.cards ?? [];

  // An empty grid renders NOTHING — a palette-added block is an open slot, never a
  // hollow card. Returning null here is what makes `cards: []` safe as a default.
  if (cards.length === 0) return null;

  // Card width inside the 600px canvas minus the 28px section padding — the 2-up
  // numbers from MultiColumnBlock, unchanged so the two blocks align in one email.
  const maxW = 260;
  const minW = 200;

  return (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {props.title ? (
        <Text
          style={{
            fontFamily: font,
            ...text("h2"),
            color: onDark ? ON_DARK_BODY : globalStyle.primaryColor,
            margin: space(0, 0, 4),
          }}
        >
          {props.title}
        </Text>
      ) : null}

      {props.subtitle ? (
        <Text
          style={{
            fontFamily: font,
            ...text("caption", { weight: WEIGHT.emphasis }),
            color: onDark ? ON_DARK_MUTED : MUTED,
            margin: space(0, 0, 12),
          }}
        >
          {props.subtitle}
        </Text>
      ) : null}

      <div style={{ fontSize: 0 }}>
        {cards.map((c, i) => (
          <div
            key={i}
            style={{
              display: "inline-block",
              verticalAlign: "top",
              width: "100%",
              maxWidth: `${maxW}px`,
              minWidth: `${minW}px`,
              boxSizing: "border-box",
              padding: pad(0, 8),
              paddingBottom: "16px",
              textAlign: "left",
            }}
          >
            {/* photoUrl is REQUIRED by the schema and passed through VERBATIM — the
                builder never constructs a URL, and any mapbox-hosted photo was
                already dropped at selection time (F1). */}
            <Link href={c.linkUrl}>
              <Img
                src={c.photoUrl}
                alt={c.photoAlt ?? c.addressLine1 ?? "Listing photo"}
                width={maxW}
                // Fixed height + cover, the MultiColumnBlock/AgentHero precedent:
                // mixed-aspect listing photos otherwise start each card's price at a
                // different y and the row reads ragged.
                style={{
                  width: "100%",
                  height: "160px",
                  objectFit: "cover",
                  display: "block",
                  borderRadius: "6px",
                }}
              />
            </Link>

            {c.statusLabel ? (
              <Text
                style={{
                  fontFamily: font,
                  ...text("caption"),
                  color: c.statusTone === "sold" ? TONE.sold : TONE.active,
                  margin: space(8, 0, 0),
                }}
              >
                {`● ${c.statusLabel}`}
              </Text>
            ) : null}

            {c.price ? (
              <Text
                style={{
                  fontFamily: font,
                  ...text("metric", { numeric: true }),
                  // 22px/700 = WCAG large text → 3:1 floor, the ListingBlock rule.
                  color: legibleInk(globalStyle.primaryColor, bg, 3),
                  margin: space(4, 0, 0),
                }}
              >
                {c.price}
                {c.priceCut ? (
                  <span
                    style={{ ...text("caption", { numeric: true }), color: TONE.active }}
                  >{`  ↓ ${c.priceCut}`}</span>
                ) : null}
              </Text>
            ) : null}

            {/* ALL THREE specs or nothing — the builder never sets a partial line
                (F8). A missing bath count means no line at all, not a blank slot. */}
            {c.specs ? (
              <Text
                style={{
                  fontFamily: font,
                  ...text("caption", { numeric: true }),
                  color: onDark ? ON_DARK_MUTED : MUTED,
                  margin: space(4, 0, 0),
                }}
              >
                {c.specs}
              </Text>
            ) : null}

            {c.addressLine1 ? (
              <Text
                style={{
                  fontFamily: font,
                  ...text("caption"),
                  color: onDark ? ON_DARK_BODY : globalStyle.textColor,
                  margin: space(4, 0, 0),
                }}
              >
                {c.addressLine1}
              </Text>
            ) : null}

            {/* The card's OWN city/state/ZIP (F6) — a city-backfilled home must never
                read as if it sits in the ZIP the reader asked about. */}
            {c.addressLine2 ? (
              <Text
                style={{
                  fontFamily: font,
                  ...text("caption"),
                  color: onDark ? ON_DARK_MUTED : MUTED,
                  margin: 0,
                }}
              >
                {c.addressLine2}
              </Text>
            ) : null}

            <Text style={{ margin: space(8, 0, 0) }}>
              <Link
                href={c.linkUrl}
                style={{
                  fontFamily: font,
                  ...text("caption", { weight: WEIGHT.emphasis }),
                  color: onDark
                    ? legibleAccent(globalStyle.accentColor, bg)
                    : legibleInk(globalStyle.accentColor, bg, 4.5),
                }}
              >
                View listing →
              </Link>
            </Text>
          </div>
        ))}
      </div>

      {props.ctaLabel && props.ctaUrl ? (
        <Text style={{ margin: space(8, 0, 0) }}>
          <Link
            href={props.ctaUrl}
            style={{
              fontFamily: font,
              ...text("caption", { weight: WEIGHT.emphasis }),
              color: onDark
                ? legibleAccent(globalStyle.accentColor, bg)
                : legibleInk(globalStyle.accentColor, bg, 4.5),
            }}
          >
            {props.ctaLabel}
          </Link>
        </Text>
      ) : null}
    </Section>
  );
}
