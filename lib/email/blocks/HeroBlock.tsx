// lib/email/blocks/HeroBlock.tsx — PURE. Big number / kicker / prose.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, HeroProps } from "../doc/types";
import { displayFontStack, fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { DISPLAY_FONT_CLASS } from "./email-head";
import { isDarkBg, legibleAccent, ON_DARK_BODY, ON_DARK_MUTED, ON_DARK_TITLE } from "./on-dark";

export function HeroBlock({
  props,
  globalStyle,
}: {
  props: HeroProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const displayFont = displayFontStack(globalStyle);
  const bg = props.sectionBg ?? globalStyle.surfaceColor ?? CARD_BG;
  const onDark = isDarkBg(bg);
  // A banded hero carrying a figure is the "stat clipping" — the letter's one
  // piece of hard evidence, pinned with an accent left border. Unbanded heros
  // (no explicit sectionBg) render exactly as before.
  const clipping = Boolean(props.sectionBg && props.value);
  const clipAccent = onDark ? legibleAccent(globalStyle.accentColor, bg) : globalStyle.accentColor;
  const inner = (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
        ...(clipping ? { borderLeft: `4px solid ${clipAccent}` } : {}),
      }}
    >
      {props.kicker ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "11px",
            fontWeight: 700,
            color: onDark ? legibleAccent(globalStyle.accentColor, bg) : globalStyle.accentColor,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: "0 0 8px",
            // Clipping heros sit in side-by-side PAIRS — reserve two kicker
            // lines so a wrapped kicker on one card can never stagger the
            // values/bottoms against its partner (operator flag 07/05/2026).
            ...(clipping ? { minHeight: "34px" } : {}),
          }}
        >
          {props.kicker}
        </Text>
      ) : null}
      {props.value ? (
        <Text
          className={DISPLAY_FONT_CLASS}
          style={{
            fontFamily: displayFont,
            fontSize: "48px",
            lineHeight: "1.1",
            fontWeight: 700,
            color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
            margin: 0,
          }}
        >
          {props.value}
        </Text>
      ) : null}
      {props.label ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "13px",
            color: onDark ? ON_DARK_MUTED : MUTED,
            margin: "6px 0 0",
          }}
        >
          {props.label}
        </Text>
      ) : null}
      {props.prose ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "16px",
            lineHeight: "1.65",
            color: onDark ? ON_DARK_BODY : globalStyle.textColor,
            margin: "14px 0 0",
          }}
        >
          {props.prose}
        </Text>
      ) : null}
    </Section>
  );
  if (!props.linkUrl) return inner;
  return (
    <Link href={props.linkUrl} style={{ display: "block", textDecoration: "none" }}>
      {inner}
    </Link>
  );
}
