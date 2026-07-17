// lib/email/blocks/HeroBlock.tsx — PURE. Big number / kicker / prose.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, HeroProps } from "../doc/types";
import { displayFontStack, fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { text, label, lines, pad, space, CARD_PAD } from "./scale";
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
      <Section style={{ backgroundColor: accent, padding: pad(8, CARD_PAD) }}>
        <Text
          style={{
            fontFamily: font,
            ...label(),
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
          ...text("h2"),
          color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
          textAlign,
          margin: space(0, 0, 8),
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
            ...label(),
            color: accent,
            textTransform: "uppercase",
            textAlign,
            margin: space(0, 0, 8),
            // Clipping heros sit in side-by-side PAIRS — reserve two kicker
            // lines so a wrapped kicker on one card can never stagger the
            // values/bottoms against its partner (operator flag 07/05/2026).
            ...(clipping ? { minHeight: lines("caption", 2) } : {}),
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
          placeholder="$—"
          style={{
            fontFamily: displayFont,
            ...text("h1", { numeric: true }),
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
            ...text("caption"),
            color: onDark ? ON_DARK_MUTED : MUTED,
            textAlign,
            margin: space(8, 0, 0),
            // Same fix as the kicker above, same bug: clipping heros sit in side-by-side
            // PAIRS, and a label carries a ZIP-qualified figure name ("Median home value —
            // Fort Myers (33905)") that is routinely longer than its sibling's ("Typical
            // home value — United States"). A 2-line wrap on one card with no reservation
            // on the other staggers everything below it — the two cards' bottoms, and the
            // provenance line under each, stop lining up. Caught live 07/14/2026 on
            // sphere-weekly's national/local pair.
            ...(clipping ? { minHeight: lines("caption", 2) } : {}),
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
            ...text("body"),
            color: onDark ? ON_DARK_BODY : globalStyle.textColor,
            textAlign,
            margin: space(16, 0, 0),
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
