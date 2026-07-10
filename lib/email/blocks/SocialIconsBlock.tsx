// lib/email/blocks/SocialIconsBlock.tsx — PURE. A standalone social row/column.
// Shared by the canvas DOM view AND the server email render. Reads the platform
// registry (lib/email/social/platforms.ts) for labels + brand colors, and the
// icon registry (components/email-lab/social-icons) for glyphs — the SAME roots
// the footer's social row uses, so a platform/color change lands in both.
import { Section, Link, Text } from "@react-email/components";
import type { EmailGlobalStyle, SocialIconsProps, SocialPlatformEntry } from "../doc/types";
import { platformMeta, domainFromUrl } from "../social/platforms";
import { SocialIcon } from "@/components/email-lab/social-icons";
import { fontStack, SECTION_PAD, CARD_BG, BORDER, MUTED } from "./styles";
import { legibleInk } from "./on-dark";

const SIZE_PX: Record<NonNullable<SocialIconsProps["iconSize"]>, number> = {
  sm: 20,
  md: 28,
  lg: 36,
};

/** Display label for an entry: known → registry label; custom → user label or domain. */
function labelFor(entry: SocialPlatformEntry): string {
  if (entry.type === "custom") return entry.label || domainFromUrl(entry.url) || "Link";
  return platformMeta(entry.type).label;
}

/** Resolve the icon fill color from the block's color mode. */
function colorFor(entry: SocialPlatformEntry, props: SocialIconsProps, accent: string): string {
  const mode = props.iconColor ?? "original";
  if (mode === "brand") return accent;
  if (mode === "custom") return props.customIconColor || accent;
  // "original": known platform brand color; custom has none → accent.
  return entry.type === "custom" ? accent : platformMeta(entry.type).brandColor;
}

export function SocialIconsBlock({
  props,
  globalStyle,
  emailRender,
}: {
  props: SocialIconsProps;
  globalStyle: EmailGlobalStyle;
  /** True on the sendable-HTML paths — the canvas-only empty placeholder must
   *  never reach a recipient ("Add social links in the panel →" shipped into
   *  the stay-in-touch capture, 07/10/2026). */
  emailRender?: boolean;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const accent = globalStyle.accentColor;
  const displayMode = props.displayMode ?? "icon+text";
  const layout = props.layout ?? "row";
  const size = SIZE_PX[props.iconSize ?? "md"];

  const entries = (props.platforms ?? []).filter((p) => p.url.trim().length > 0);

  // Empty in an EMAIL → render nothing (applyBrand never fills platforms, so
  // the placeholder would ship to real recipients).
  if (entries.length === 0 && emailRender) return null;

  // Empty → a muted placeholder so the block stays visible/selectable on the
  // canvas (mirrors the image block's empty state). The user fills it in the panel.
  if (entries.length === 0) {
    return (
      <Section
        style={{
          backgroundColor: CARD_BG,
          padding: SECTION_PAD,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Text
          style={{
            fontFamily: font,
            fontSize: "13px",
            color: MUTED,
            margin: 0,
            textAlign: "center",
          }}
        >
          Add social links in the panel →
        </Text>
      </Section>
    );
  }

  const isRow = layout === "row";
  const labelColor = globalStyle.textColor || MUTED;

  return (
    <Section
      style={{
        backgroundColor: CARD_BG,
        padding: SECTION_PAD,
        textAlign: "center",
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {entries.map((entry, i) => {
        const label = labelFor(entry);
        // Icons sit on the white card — non-text floor 3 (custom entries carry
        // the brand accent; known platforms keep their own brand colors).
        const color = legibleInk(colorFor(entry, props, accent), CARD_BG, 3);
        const showIcon = displayMode !== "text";
        const showText = displayMode !== "icon";
        return (
          <Link
            key={`${entry.type}-${i}`}
            href={entry.url}
            style={{
              display: isRow ? "inline-flex" : "flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              color: labelColor,
              fontFamily: font,
              fontSize: "13px",
              marginRight: isRow ? "16px" : 0,
              marginBottom: isRow ? "4px" : "10px",
              justifyContent: isRow ? "center" : "flex-start",
            }}
          >
            {showIcon ? (
              <SocialIcon
                type={entry.type}
                size={size}
                color={color}
                logoUrl={entry.logoUrl}
                label={label}
              />
            ) : null}
            {showText ? <span>{label}</span> : null}
          </Link>
        );
      })}
    </Section>
  );
}
