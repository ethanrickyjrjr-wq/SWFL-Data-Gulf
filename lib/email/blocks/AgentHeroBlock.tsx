// lib/email/blocks/AgentHeroBlock.tsx — PURE.
// Full-bleed rectangular agent photo (banner height) + brand-colored name strip below.
// Designed for browser canvas + PDF print — NOT circle, not sidebar.
import { Section, Img, Text, Link } from "@react-email/components";
import type { AgentHeroProps, EmailGlobalStyle } from "../doc/types";
import { fontStack, CARD_BG, BORDER, MUTED } from "./styles";
import { text, label, pad, space, WEIGHT, CARD_PAD } from "./scale";
import { legibleInk } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";
import { AGENT_HERO_PHOTO_HEIGHT, AGENT_HERO_PHOTO_MAX_WIDTH } from "./agent-hero-dimensions";

// Photo box shared with the PDF renderer via the one ratio root (agent-hero-dimensions.ts).
const PHOTO_HEIGHT = AGENT_HERO_PHOTO_HEIGHT;
const PLACEHOLDER_BG = "#1a2e35";

export function AgentHeroBlock({
  props,
  globalStyle,
  scope,
}: {
  props: AgentHeroProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  return (
    <Section style={{ backgroundColor: CARD_BG, borderBottom: `1px solid ${BORDER}` }}>
      {/* Photo banner — full 600px wide, fixed height, object-fit cover */}
      {props.photoUrl ? (
        <Img
          src={props.photoUrl}
          alt={props.alt ?? props.name ?? ""}
          style={{
            width: "100%",
            maxWidth: `${AGENT_HERO_PHOTO_MAX_WIDTH}px`,
            height: `${PHOTO_HEIGHT}px`,
            display: "block",
            margin: 0,
            objectFit: "cover",
            objectPosition: "center top",
          }}
        />
      ) : (
        <Section
          style={{
            height: `${PHOTO_HEIGHT}px`,
            backgroundColor: PLACEHOLDER_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: font, ...text("caption"), color: "#ffffff50", margin: 0 }}>
            Agent photo
          </Text>
        </Section>
      )}

      {/* Brand-colored name strip */}
      <Section
        style={{
          backgroundColor: globalStyle.primaryColor,
          padding: pad(16, CARD_PAD),
          borderTop: `3px solid ${globalStyle.accentColor}`,
        }}
      >
        {props.name || scope ? (
          <EditableText
            as={Text}
            value={props.name ?? ""}
            path="name"
            scope={scope}
            placeholder="Agent name"
            style={{
              fontFamily: font,
              ...text("h2"),
              // 22px/800 = WCAG large text → 3:1 floor (spec D3)
              color: legibleInk("#ffffff", globalStyle.primaryColor, 3),
              margin: space(0, 0, 4),
            }}
          />
        ) : null}
        {props.designation || scope ? (
          <EditableText
            as={Text}
            value={props.designation ?? ""}
            path="designation"
            scope={scope}
            placeholder="Designation"
            style={{
              fontFamily: font,
              ...label(),
              color: legibleInk(globalStyle.accentColor, globalStyle.primaryColor, 4.5),
              margin: 0,
              textTransform: "uppercase",
            }}
          />
        ) : null}
      </Section>

      {/* Tagline + CTA */}
      {props.tagline || (props.ctaLabel && props.ctaUrl) || scope ? (
        <Section style={{ padding: pad(16, CARD_PAD), borderBottom: `1px solid ${BORDER}` }}>
          {props.tagline || scope ? (
            <EditableText
              as={Text}
              value={props.tagline ?? ""}
              path="tagline"
              scope={scope}
              multiline
              placeholder="Tagline…"
              style={{
                fontFamily: font,
                ...text("body"),
                color: MUTED,
                margin: space(0, 0, 8),
              }}
            />
          ) : null}
          {props.ctaLabel && props.ctaUrl ? (
            <Text style={{ margin: 0 }}>
              <Link
                href={props.ctaUrl}
                style={{
                  fontFamily: font,
                  ...text("caption", { weight: WEIGHT.emphasis }),
                  color: legibleInk(globalStyle.accentColor, CARD_BG, 4.5),
                  textDecoration: "none",
                }}
              >
                <EditableText value={props.ctaLabel} path="ctaLabel" scope={scope} />
                {" →"}
              </Link>
            </Text>
          ) : null}
        </Section>
      ) : null}
    </Section>
  );
}
