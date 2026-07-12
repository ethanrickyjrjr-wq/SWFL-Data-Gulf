// lib/email/blocks/HeaderBlock.tsx — PURE (no "use client"). Logo + company name.
import { Section, Img, Text } from "@react-email/components";
import type { EmailGlobalStyle, HeaderProps } from "../doc/types";
import { displayFontStack, fontStack, SECTION_PAD } from "./styles";
import { DISPLAY_FONT_CLASS } from "./email-head";
import { legibleInk } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function HeaderBlock({
  props,
  globalStyle,
  scope,
}: {
  props: HeaderProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const displayFont = displayFontStack(globalStyle);
  const bg = props.bgColor ?? globalStyle.primaryColor;
  return (
    <Section
      style={{
        backgroundColor: bg,
        padding: SECTION_PAD,
        borderBottom: `3px solid ${globalStyle.accentColor}`,
      }}
    >
      {props.logoUrl ? (
        <Img
          src={props.logoUrl}
          alt={props.companyName ?? ""}
          style={{ maxHeight: "42px", maxWidth: "180px", margin: "0 0 8px", display: "block" }}
        />
      ) : null}
      {props.companyName || scope ? (
        <EditableText
          as={Text}
          className={DISPLAY_FONT_CLASS}
          value={props.companyName ?? ""}
          path="companyName"
          scope={scope}
          placeholder="Company"
          style={{
            fontFamily: displayFont,
            fontSize: "18px",
            fontWeight: 700,
            color: legibleInk("#ffffff", bg, 4.5),
            margin: 0,
          }}
        />
      ) : null}
      {props.tagline || scope ? (
        <EditableText
          as={Text}
          value={props.tagline ?? ""}
          path="tagline"
          scope={scope}
          placeholder="Tagline"
          style={{
            fontFamily: font,
            fontSize: "12px",
            color: legibleInk(globalStyle.accentColor, bg, 4.5),
            margin: "4px 0 0",
          }}
        />
      ) : null}
    </Section>
  );
}
