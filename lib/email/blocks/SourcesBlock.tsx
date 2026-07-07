// lib/email/blocks/SourcesBlock.tsx — PURE. The collapsed "Sources" accordion for
// the Email Lab block canvas. Native <details>/<summary> — no client JS, so it
// collapses the same way in the canvas preview, the sent HTML email (Apple Mail,
// iOS Mail, Gmail web all honor <details>; Outlook/older clients render it
// permanently open, which just degrades to "always expanded", never broken), and
// the copy the operator keeps hitting: sources are an accordion, CLOSED until
// clicked — never a wall of inline text. Labels/links route through the ONE
// citation root (lib/citations/clean-url) so a source here cleans identically to
// every other citation surface (components/CitationList.tsx).
import { Link, Section, Text } from "@react-email/components";
import { cleanCitations } from "@/lib/citations/clean-url";
import type { EmailGlobalStyle, SourcesProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER, MUTED } from "./styles";

export function SourcesBlock({
  props,
  globalStyle,
}: {
  props: SourcesProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const cited = cleanCitations(props.sources ?? []);
  if (cited.length === 0) return null;

  return (
    <Section
      style={{
        backgroundColor: props.sectionBg ?? CARD_BG,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <details>
        <summary
          style={{
            fontFamily: font,
            fontSize: "12px",
            fontWeight: 700,
            color: MUTED,
            cursor: "pointer",
          }}
        >
          Sources ({cited.length})
        </summary>
        <div style={{ marginTop: "10px" }}>
          {cited.map((c, i) =>
            c.linkable && c.href ? (
              <Text
                key={c.href ?? i}
                style={{ fontFamily: font, fontSize: "11px", lineHeight: "1.6", margin: "0 0 4px" }}
              >
                <Link href={c.href} style={{ color: globalStyle.accentColor }}>
                  {c.label}
                </Link>
              </Text>
            ) : (
              <Text
                key={`${c.label}-${i}`}
                style={{
                  fontFamily: font,
                  fontSize: "11px",
                  lineHeight: "1.6",
                  color: MUTED,
                  margin: "0 0 4px",
                }}
              >
                {c.label}
              </Text>
            ),
          )}
        </div>
      </details>
      {props.note ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "11px",
            color: MUTED,
            margin: "10px 0 0",
          }}
        >
          {props.note}
        </Text>
      ) : null}
    </Section>
  );
}
