// lib/email/blocks/ButtonBlock.tsx — PURE. Single centered CTA.
import { Section, Button, Text } from "@react-email/components";
import type { ButtonProps, EmailGlobalStyle } from "../doc/types";
import { fontStack, SECTION_PAD, CARD_BG, BORDER } from "./styles";
import { legibleInk } from "./on-dark";

export function ButtonBlock({
  props,
  globalStyle,
}: {
  props: ButtonProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
  if (!props.label) return null;
  const bg = props.bgColor ?? globalStyle.primaryColor;
  const sharedStyle = {
    backgroundColor: bg,
    color: legibleInk("#ffffff", bg, 4.5),
    padding: "14px 32px",
    borderRadius: "8px",
    fontFamily: font,
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
  };
  return (
    <Section
      style={{
        backgroundColor: CARD_BG,
        padding: SECTION_PAD,
        textAlign: "center",
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {props.url ? (
        <Button href={props.url} style={sharedStyle}>
          {props.label}
        </Button>
      ) : (
        <Text style={{ ...sharedStyle, margin: 0 }}>{props.label}</Text>
      )}
    </Section>
  );
}
