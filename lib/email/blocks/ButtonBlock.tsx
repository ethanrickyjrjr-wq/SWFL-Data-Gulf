// lib/email/blocks/ButtonBlock.tsx — PURE. Single centered CTA.
import { Section, Button, Text } from "@react-email/components";
import type { ButtonProps, EmailGlobalStyle } from "../doc/types";
import { fontStack, SECTION_PAD, CARD_BG, BORDER } from "./styles";
import { legibleInk } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function ButtonBlock({
  props,
  globalStyle,
  scope,
}: {
  props: ButtonProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  if (!props.label && !scope) return null;
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
          <EditableText value={props.label ?? ""} path="label" scope={scope} placeholder="Button" />
        </Button>
      ) : (
        <EditableText
          as={Text}
          value={props.label ?? ""}
          path="label"
          scope={scope}
          placeholder="Button"
          style={{ ...sharedStyle, margin: 0 }}
        />
      )}
    </Section>
  );
}
