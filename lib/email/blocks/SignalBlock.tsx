// lib/email/blocks/SignalBlock.tsx — PURE. Callout box with kicker + body.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, SignalProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER } from "./styles";
import { isDarkBg, legibleAccent, ON_DARK_BODY, ON_DARK_TITLE } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function SignalBlock({
  props,
  globalStyle,
  scope,
}: {
  props: SignalProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const boxBg = props.bgColor ?? "#F0F9FA";
  // The text sits on the CALLOUT BOX, not the outer section — key the flip there.
  const onDark = isDarkBg(boxBg);
  const inner = (
    <Section
      style={{
        backgroundColor: props.sectionBg ?? CARD_BG,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <Section
        style={{
          backgroundColor: boxBg,
          borderLeft: `4px solid ${globalStyle.accentColor}`,
          borderRadius: "6px",
          padding: "16px 18px",
        }}
      >
        {props.kicker || scope ? (
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
              color: onDark
                ? legibleAccent(globalStyle.accentColor, boxBg)
                : globalStyle.accentColor,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 6px",
            }}
          />
        ) : null}
        {props.title || scope ? (
          <EditableText
            as={Text}
            value={props.title ?? ""}
            path="title"
            scope={scope}
            placeholder="Headline"
            style={{
              fontFamily: font,
              fontSize: "18px",
              fontWeight: 700,
              color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
              margin: "0 0 6px",
            }}
          />
        ) : null}
        {props.body || scope ? (
          <EditableText
            as={Text}
            value={props.body ?? ""}
            path="body"
            scope={scope}
            multiline
            placeholder="What's the signal…"
            style={{
              fontFamily: font,
              fontSize: "14px",
              lineHeight: "1.65",
              color: onDark ? ON_DARK_BODY : globalStyle.textColor,
              margin: 0,
            }}
          />
        ) : null}
      </Section>
    </Section>
  );
  if (!props.linkUrl) return inner;
  return (
    <Link href={props.linkUrl} style={{ display: "block", textDecoration: "none" }}>
      {inner}
    </Link>
  );
}
