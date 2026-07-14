// lib/email/blocks/TextBlock.tsx — PURE. A paragraph of prose.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, TextProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER } from "./styles";
import { text, pad } from "./scale";
import { isDarkBg, ON_DARK_BODY } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";
import { OPEN_SLOT_INK } from "./OpenSlot";

export function TextBlock({
  props,
  globalStyle,
  emailRender,
  scope,
}: {
  props: TextProps;
  globalStyle: EmailGlobalStyle;
  /** True on the sendable-HTML paths — an unwritten paragraph is an OPEN SLOT with an
   *  instruction on the canvas, and does not exist in the email (today it shipped as
   *  an empty bordered band). */
  emailRender?: boolean;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const bg = props.sectionBg ?? CARD_BG;

  // Nothing written → no block in the email. On the canvas the placeholder below is
  // an INSTRUCTION ("paste it and we'll tighten it"), not a caption.
  if (emailRender && !(props.body ?? "").trim()) return null;

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
          placeholder="Paste your text here — we'll tighten it."
          style={{
            fontFamily: font,
            ...text("body"),
            color: isDarkBg(bg) ? ON_DARK_BODY : globalStyle.textColor,
            textAlign: props.align ?? "left",
            margin: 0,
            whiteSpace: "pre-line",
            // Empty + on the canvas → the dashed "yours to fill" outline.
            ...(scope && !(props.body ?? "").trim()
              ? { ...OPEN_SLOT_INK, padding: pad(8, 12) }
              : {}),
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
