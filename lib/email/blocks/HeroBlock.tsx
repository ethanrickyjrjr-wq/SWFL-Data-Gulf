// lib/email/blocks/HeroBlock.tsx — PURE. Big number / kicker / prose.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, HeroProps } from "../doc/types";
import { displayFontStack, fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { DISPLAY_FONT_CLASS } from "./email-head";
import { isDarkBg, legibleAccent, ON_DARK_BODY, ON_DARK_MUTED, ON_DARK_TITLE } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function HeroBlock({
  props,
  globalStyle,
  scope,
}: {
  props: HeroProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
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

  // ── THE DESIGN VOCABULARY (07/13/2026) ──────────────────────────────────────
  // A listing flyer reads ADDRESS over PRICE, centred, with the kicker as an accent
  // RIBBON — not a left-aligned 11px caption over a black number. The block had no way to
  // say any of that, which is the whole reason the built email never looked like the
  // hand-drawn sample. Every knob is OPTIONAL and defaults to today's rendering.
  const centered = props.align === "center";
  const labelFirst = props.order === "label-first";
  const textAlign = centered ? ("center" as const) : ("left" as const);
  const accent = onDark ? legibleAccent(globalStyle.accentColor, bg) : globalStyle.accentColor;

  // The RIBBON: a full-width accent band carrying the kicker. This is the "◆ NEW LISTING ◆"
  // bar in the sample — a design element, not a caption.
  const ribbon =
    props.ribbon && props.kicker ? (
      <Section style={{ backgroundColor: accent, padding: "9px 28px" }}>
        <Text
          style={{
            fontFamily: font,
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            textAlign: "center",
            color: isDarkBg(accent) ? "#ffffff" : "#1a1a1a",
            margin: 0,
          }}
        >
          {props.kicker}
        </Text>
      </Section>
    ) : null;

  // The ADDRESS line, when it leads. Display serif, sized to be read as the subject of the
  // email — because on a listing flyer, it IS the subject.
  const leadLabel =
    labelFirst && props.label ? (
      <EditableText
        as={Text}
        className={DISPLAY_FONT_CLASS}
        value={props.label}
        path="label"
        scope={scope}
        placeholder="Address"
        style={{
          fontFamily: displayFont,
          fontSize: "27px",
          lineHeight: "1.25",
          fontWeight: 400,
          color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
          textAlign,
          margin: "0 0 10px",
        }}
      />
    ) : null;

  const inner = (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
        ...(clipping ? { borderLeft: `4px solid ${clipAccent}` } : {}),
      }}
    >
      {/* The kicker is a CAPTION only when it isn't a ribbon — a ribbon already carries it. */}
      {!props.ribbon && (props.kicker || scope) ? (
        <EditableText
          as={Text}
          value={props.kicker ?? ""}
          path="kicker"
          scope={scope}
          placeholder="Kicker"
          style={{
            fontFamily: font,
            fontSize: "11px",
            fontWeight: 700,
            color: accent,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign,
            margin: "0 0 8px",
            // Clipping heros sit in side-by-side PAIRS — reserve two kicker
            // lines so a wrapped kicker on one card can never stagger the
            // values/bottoms against its partner (operator flag 07/05/2026).
            ...(clipping ? { minHeight: "34px" } : {}),
          }}
        />
      ) : null}

      {/* ADDRESS ABOVE PRICE, when the recipe asks for it. On a listing flyer the address IS
          the subject; the price is the headline number under it. */}
      {leadLabel}

      {props.value || scope ? (
        <EditableText
          as={Text}
          className={DISPLAY_FONT_CLASS}
          value={props.value ?? ""}
          path="value"
          scope={scope}
          placeholder="$0"
          style={{
            fontFamily: displayFont,
            fontSize: "48px",
            lineHeight: "1.1",
            fontWeight: 700,
            // THE PRICE IS THE ACCENT when the address leads it — that is the hierarchy the
            // sample has and ours did not: one gold number the eye lands on.
            color: labelFirst ? accent : onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
            textAlign,
            margin: 0,
          }}
        />
      ) : null}

      {/* The trailing label — suppressed when it already led. */}
      {!labelFirst && (props.label || scope) ? (
        <EditableText
          as={Text}
          value={props.label ?? ""}
          path="label"
          scope={scope}
          placeholder="Label"
          style={{
            fontFamily: font,
            fontSize: "13px",
            color: onDark ? ON_DARK_MUTED : MUTED,
            textAlign,
            margin: "6px 0 0",
          }}
        />
      ) : null}

      {props.prose || scope ? (
        <EditableText
          as={Text}
          value={props.prose ?? ""}
          path="prose"
          scope={scope}
          multiline
          placeholder="Add a sentence…"
          style={{
            fontFamily: font,
            fontSize: "16px",
            lineHeight: "1.65",
            color: onDark ? ON_DARK_BODY : globalStyle.textColor,
            textAlign,
            margin: "14px 0 0",
          }}
        />
      ) : null}
    </Section>
  );

  // A RIBBON-ONLY hero: the kicker band and nothing else. This is how the sample runs its
  // "◆ NEW LISTING ◆" bar BETWEEN the header and the photo — the band is a design element
  // in its own right, not a caption stapled to a number. Without this, the ribbon can only
  // appear wherever the price happens to be, and the layout can never match.
  const ribbonOnly = Boolean(ribbon) && !props.value && !props.label && !props.prose && !scope;
  if (ribbonOnly) return ribbon;

  const body = ribbon ? (
    <>
      {ribbon}
      {inner}
    </>
  ) : (
    inner
  );

  if (!props.linkUrl) return body;
  return (
    <Link href={props.linkUrl} style={{ display: "block", textDecoration: "none" }}>
      {body}
    </Link>
  );
}
