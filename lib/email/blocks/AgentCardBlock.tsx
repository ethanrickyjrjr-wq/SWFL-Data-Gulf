// lib/email/blocks/AgentCardBlock.tsx — PURE. Editorial portrait + name + bio.
import { Section, Row, Column, Img, Text, Link } from "@react-email/components";
import type { AgentCardProps, EmailGlobalStyle } from "../doc/types";
import { fontStack, SECTION_PAD, MUTED, BORDER, CARD_BG } from "./styles";
import { legibleInk } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

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
                fontSize: "15px",
                fontWeight: 700,
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
              style={{ fontFamily: font, fontSize: "12px", color: MUTED, margin: "2px 0 0" }}
            />
          ) : null}
          {props.bio || scope ? (
            <EditableText
              as={Text}
              value={props.bio ?? ""}
              path="bio"
              scope={scope}
              multiline
              placeholder="Short bio…"
              style={{
                fontFamily: font,
                fontSize: "13px",
                lineHeight: "1.6",
                color: globalStyle.textColor,
                margin: "8px 0 0",
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
              style={{ fontFamily: font, fontSize: "12px", color: MUTED, margin: "8px 0 0" }}
            />
          ) : null}
          {props.ctaLabel && props.ctaUrl ? (
            <Text style={{ margin: "8px 0 0" }}>
              <Link
                href={props.ctaUrl}
                style={{
                  fontFamily: font,
                  fontSize: "13px",
                  fontWeight: 600,
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
