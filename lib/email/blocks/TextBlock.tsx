// lib/email/blocks/TextBlock.tsx — PURE. A paragraph of prose.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, TextProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER } from "./styles";
import { isDarkBg, ON_DARK_BODY } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function TextBlock({
  props,
  globalStyle,
  scope,
}: {
  props: TextProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const bg = props.sectionBg ?? CARD_BG;
  const inner = (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {props.body || scope ? (
        <EditableText
          as={Text}
          value={props.body ?? ""}
          path="body"
          scope={scope}
          multiline
          placeholder="Write your message…"
          style={{
            fontFamily: font,
            fontSize: "16px",
            lineHeight: "1.75",
            color: isDarkBg(bg) ? ON_DARK_BODY : globalStyle.textColor,
            textAlign: props.align ?? "left",
            margin: 0,
            whiteSpace: "pre-line",
          }}
        />
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
