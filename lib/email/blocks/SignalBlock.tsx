// lib/email/blocks/SignalBlock.tsx — PURE. Callout box with kicker + body.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, SignalProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER } from "./styles";

export function SignalBlock({
  props,
  globalStyle,
}: {
  props: SignalProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const boxBg = props.bgColor ?? "#F0F9FA";
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
        {props.kicker ? (
          <Text
            style={{
              fontFamily: font,
              fontSize: "11px",
              fontWeight: 700,
              color: globalStyle.accentColor,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 6px",
            }}
          >
            {props.kicker}
          </Text>
        ) : null}
        {props.title ? (
          <Text
            style={{
              fontFamily: font,
              fontSize: "18px",
              fontWeight: 700,
              color: globalStyle.primaryColor,
              margin: "0 0 6px",
            }}
          >
            {props.title}
          </Text>
        ) : null}
        {props.body ? (
          <Text
            style={{
              fontFamily: font,
              fontSize: "14px",
              lineHeight: "1.65",
              color: globalStyle.textColor,
              margin: 0,
            }}
          >
            {props.body}
          </Text>
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
