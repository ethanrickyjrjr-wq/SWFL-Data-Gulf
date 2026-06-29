// lib/email/blocks/ListingBlock.tsx — PURE. A single property card: photo on top,
// price (bold), beds/baths/sqft row, address. Optional badge tag + click-through.
// All fields are USER-OWNED / listing-sourced — the AI content-patch never writes
// a price (no-invention moat); they come from the inspector or a listing-URL pull.
import { Section, Img, Text, Link } from "@react-email/components";
import type { EmailGlobalStyle, ListingProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";

export function ListingBlock({
  props,
  globalStyle,
}: {
  props: ListingProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
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
        backgroundColor: props.sectionBg ?? CARD_BG,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {photo ? props.linkUrl ? <Link href={props.linkUrl}>{photo}</Link> : photo : null}

      {props.badge ? (
        <Text
          style={{
            display: "inline-block",
            fontFamily: font,
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#06231f",
            backgroundColor: globalStyle.accentColor,
            padding: "3px 8px",
            borderRadius: "4px",
            margin: photo ? "12px 0 0" : "0",
          }}
        >
          {props.badge}
        </Text>
      ) : null}

      {props.price ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "22px",
            fontWeight: 700,
            color: globalStyle.primaryColor,
            margin: "10px 0 0",
          }}
        >
          {props.price}
        </Text>
      ) : null}

      {specs ? (
        <Text style={{ fontFamily: font, fontSize: "13px", color: MUTED, margin: "4px 0 0" }}>
          {specs}
        </Text>
      ) : null}

      {props.address ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "13px",
            lineHeight: "1.5",
            color: globalStyle.textColor,
            margin: "4px 0 0",
          }}
        >
          {props.address}
        </Text>
      ) : null}

      {props.linkUrl ? (
        <Text style={{ margin: "8px 0 0" }}>
          <Link
            href={props.linkUrl}
            style={{
              fontFamily: font,
              fontSize: "13px",
              fontWeight: 600,
              color: globalStyle.accentColor,
            }}
          >
            View listing →
          </Link>
        </Text>
      ) : null}
    </Section>
  );
}
