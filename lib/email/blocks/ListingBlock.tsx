// lib/email/blocks/ListingBlock.tsx — PURE. A single property card: photo on top,
// price (bold), beds/baths/sqft row, address. Optional badge tag + click-through.
// All fields are USER-OWNED / listing-sourced — the AI content-patch never writes
// a price (no-invention moat); they come from the inspector or a listing-URL pull.
import { Section, Img, Text, Link } from "@react-email/components";
import type { EmailGlobalStyle, ListingProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { text, label, pad, space, WEIGHT } from "./scale";
import { legibleInk } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function ListingBlock({
  props,
  globalStyle,
  scope,
}: {
  props: ListingProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const bg = props.sectionBg ?? CARD_BG;
  const specs = [
    props.beds ? `${props.beds} bd` : null,
    props.baths ? `${props.baths} ba` : null,
    props.sqft ? `${props.sqft} sqft` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");

  const photo = props.photoUrl ? (
    <Img
      src={props.photoUrl}
      alt={props.address ?? "Listing photo"}
      width={544}
      style={{
        width: "100%",
        maxWidth: "544px",
        height: "auto",
        display: "block",
        borderRadius: "8px",
      }}
    />
  ) : null;

  return (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {photo ? props.linkUrl ? <Link href={props.linkUrl}>{photo}</Link> : photo : null}

      {props.badge || scope ? (
        <EditableText
          as={Text}
          value={props.badge ?? ""}
          path="badge"
          scope={scope}
          placeholder="Badge"
          style={{
            display: "inline-block",
            fontFamily: font,
            ...label(),
            textTransform: "uppercase",
            color: legibleInk("#06231f", globalStyle.accentColor, 4.5),
            backgroundColor: globalStyle.accentColor,
            padding: pad(4, 8),
            borderRadius: "4px",
            margin: photo ? "12px 0 0" : "0",
          }}
        />
      ) : null}

      {props.price || scope ? (
        <EditableText
          as={Text}
          value={props.price ?? ""}
          path="price"
          scope={scope}
          placeholder="$0"
          style={{
            fontFamily: font,
            ...text("metric", { numeric: true }),
            // 22px/700 = WCAG large text → 3:1 floor (spec D3)
            color: legibleInk(globalStyle.primaryColor, bg, 3),
            margin: space(8, 0, 0),
          }}
        />
      ) : null}

      {scope ? (
        // Canvas: per-field editable spans with the identical separators; the
        // server branch below keeps today's joined string byte-for-byte.
        <Text
          style={{
            fontFamily: font,
            ...text("caption", { numeric: true }),
            color: MUTED,
            margin: space(4, 0, 0),
          }}
        >
          <EditableText value={props.beds ?? ""} path="beds" scope={scope} placeholder="3" /> bd
          {"   ·   "}
          <EditableText value={props.baths ?? ""} path="baths" scope={scope} placeholder="2" /> ba
          {"   ·   "}
          <EditableText
            value={props.sqft ?? ""}
            path="sqft"
            scope={scope}
            placeholder="1,200"
          />{" "}
          sqft
        </Text>
      ) : specs ? (
        <Text
          style={{
            fontFamily: font,
            ...text("caption", { numeric: true }),
            color: MUTED,
            margin: space(4, 0, 0),
          }}
        >
          {specs}
        </Text>
      ) : null}

      {props.address || scope ? (
        <EditableText
          as={Text}
          value={props.address ?? ""}
          path="address"
          scope={scope}
          placeholder="Address"
          style={{
            fontFamily: font,
            ...text("caption", { numeric: true }),
            ...text("caption"),
            color: globalStyle.textColor,
            margin: space(4, 0, 0),
          }}
        />
      ) : null}

      {props.linkUrl ? (
        <Text style={{ margin: space(8, 0, 0) }}>
          <Link
            href={props.linkUrl}
            style={{
              fontFamily: font,
              ...text("caption", { numeric: true }),
              ...text("caption", { weight: WEIGHT.emphasis }),
              color: legibleInk(globalStyle.accentColor, bg, 4.5),
            }}
          >
            View listing →
          </Link>
        </Text>
      ) : null}
    </Section>
  );
}
