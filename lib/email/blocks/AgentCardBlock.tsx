// lib/email/blocks/AgentCardBlock.tsx — PURE. Editorial portrait + name + bio.
import { Section, Row, Column, Img, Text, Link } from "@react-email/components";
import type { AgentCardProps, EmailGlobalStyle } from "../doc/types";
import { fontStack, SECTION_PAD, MUTED, BORDER, CARD_BG } from "./styles";
import { text, space, WEIGHT } from "./scale";
import { legibleInk } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

/**
 * THE AGENT CARD IS A SIGNATURE, NOT AN ABOUT PAGE — so the bio is cut here, at the
 * render edge, on a SENTENCE boundary and with NO ellipsis.
 *
 * Found by rendering and looking, 08/05/2026. The account brand profile's `agent_bio`
 * is a free textarea with no length limit anywhere in the stack, and this block printed
 * whatever it held, verbatim. A seven-sentence agent history — exactly what an agent
 * writes when asked for their background — rendered as a ~25-line grey column down the
 * left of the card with the CTA stranded in white space beside it. Nothing failed: the
 * data was real, every test passed, and the email looked broken.
 *
 * The placeholder on the field below has always read "Short bio…". **That is the rule
 * this function turns into a guard** — the same lesson as the `fontFamily` gap in
 * §2.1.6 (a rule that lives only in a document, or only in a placeholder, is not a
 * rule) and the same mechanic already used on the seller's description in §2.1.2 (cut
 * at a sentence, never mid-word, never with an "…", because an ellipsis on someone's
 * own words reads as though we edited them).
 *
 * The FULL bio is untouched on the profile and still ships wherever a long form is
 * wanted; `scope` (the live inspector) is also exempt, so an agent always edits the
 * whole thing and only the SENT card is bounded.
 */
const CARD_BIO_MAX = 260;
export function cardBio(bio?: string): string {
  const s = (bio ?? "").trim();
  if (s.length <= CARD_BIO_MAX) return s;
  const window = s.slice(0, CARD_BIO_MAX);
  const lastStop = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  if (lastStop > 60) return window.slice(0, lastStop + 1);
  const lastSpace = window.lastIndexOf(" ");
  return lastSpace > 60 ? window.slice(0, lastSpace) : window;
}

export function AgentCardBlock({
  props,
  globalStyle,
  scope,
}: {
  props: AgentCardProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  return (
    <Section
      style={{
        backgroundColor: CARD_BG,
        padding: SECTION_PAD,
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <Row>
        {props.photoUrl ? (
          <Column style={{ width: "108px", verticalAlign: "top" }}>
            {/* Editorial rectangular crop — agent photos are professional
                half-body portraits; a circle avatar wastes them. Width-only:
                Outlook ignores object-fit, so a fixed height would distort —
                natural aspect is the only email-safe crop. */}
            <Img
              src={props.photoUrl}
              alt={props.name ?? ""}
              width={96}
              style={{
                borderRadius: "10px",
                display: "block",
              }}
            />
          </Column>
        ) : null}
        <Column style={{ verticalAlign: "top" }}>
          {props.name || scope ? (
            <EditableText
              as={Text}
              value={props.name ?? ""}
              path="name"
              scope={scope}
              placeholder="Agent name"
              style={{
                fontFamily: font,
                ...text("body", { weight: WEIGHT.emphasis }),
                color: globalStyle.primaryColor,
                margin: 0,
              }}
            />
          ) : null}
          {props.title || scope ? (
            <EditableText
              as={Text}
              value={props.title ?? ""}
              path="title"
              scope={scope}
              placeholder="Title"
              style={{ fontFamily: font, ...text("caption"), color: MUTED, margin: space(4, 0, 0) }}
            />
          ) : null}
          {props.bio || scope ? (
            <EditableText
              as={Text}
              value={scope ? (props.bio ?? "") : cardBio(props.bio)}
              path="bio"
              scope={scope}
              multiline
              placeholder="Short bio…"
              style={{
                fontFamily: font,
                ...text("body"),
                color: globalStyle.textColor,
                margin: space(8, 0, 0),
              }}
            />
          ) : null}
          {props.phone || scope ? (
            <EditableText
              as={Text}
              value={props.phone ?? ""}
              path="phone"
              scope={scope}
              placeholder="Phone"
              style={{ fontFamily: font, ...text("caption"), color: MUTED, margin: space(8, 0, 0) }}
            />
          ) : null}
          {props.ctaLabel && props.ctaUrl ? (
            <Text style={{ margin: space(8, 0, 0) }}>
              <Link
                href={props.ctaUrl}
                style={{
                  fontFamily: font,
                  ...text("caption", { weight: WEIGHT.emphasis }),
                  color: legibleInk(globalStyle.accentColor, CARD_BG, 4.5),
                }}
              >
                <EditableText value={props.ctaLabel} path="ctaLabel" scope={scope} />
                {" →"}
              </Link>
            </Text>
          ) : null}
        </Column>
      </Row>
    </Section>
  );
}
