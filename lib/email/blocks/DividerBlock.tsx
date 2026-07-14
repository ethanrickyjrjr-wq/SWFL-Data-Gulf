// lib/email/blocks/DividerBlock.tsx — PURE. Horizontal rule.
import { Section, Hr } from "@react-email/components";
import type { DividerProps, EmailGlobalStyle } from "../doc/types";
import { CARD_BG, BORDER } from "./styles";
import { pad, CARD_PAD } from "./scale";

export function DividerBlock({ props }: { props: DividerProps; globalStyle: EmailGlobalStyle }) {
  return (
    <Section style={{ backgroundColor: CARD_BG, padding: pad(8, CARD_PAD) }}>
      <Hr style={{ borderColor: props.color ?? BORDER, margin: 0 }} />
    </Section>
  );
}
