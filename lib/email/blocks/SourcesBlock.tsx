// lib/email/blocks/SourcesBlock.tsx — PURE. The "Sources" citation block, ONE face now:
//
// EMAIL (emailRender — EmailDocRenderer + compile-grid): RENDERS NOTHING. Operator
// decree 08/19/2026, on reading a sent under-contract email: "get rid of whatever
// this shit is in all emails = Sources (1): … / Median days listed = …". The
// sources/methodology footer text is BANNED from every sent email. This return-null
// is the ONE-DOOR guarantee: both HTML engines dispatch through BlockRenderer, so
// it covers every recipe, the AI author, the ZIP digests, AND docs saved before the
// emitters were removed. Provenance still governs what may be WRITTEN (gateNarrative,
// figureCitations); it no longer prints a citation line to the reader.
//
// CANVAS (browser preview): a native <details>/<summary> accordion, CLOSED until
// clicked — kept so an old saved doc's sources block stays visible and deletable on
// the canvas instead of becoming invisible dead space.
//
// Labels/links route through the ONE citation root (lib/citations/clean-url) so a
// source here cleans identically to every other citation surface.
import { Link, Section, Text } from "@react-email/components";
import { cleanCitations } from "@/lib/citations/clean-url";
import type { EmailGlobalStyle, SourcesProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER, MUTED } from "./styles";
import { text, space } from "./scale";
import { legibleInk } from "./on-dark";

export function SourcesBlock({
  props,
  globalStyle,
  emailRender,
}: {
  props: SourcesProps;
  globalStyle: EmailGlobalStyle;
  /** True on the sendable-HTML paths — renders the Gmail-safe compact line. */
  emailRender?: boolean;
}) {
  // THE SENT EMAIL CARRIES NO SOURCES COMMENTARY. Decree 08/19/2026 — see header.
  if (emailRender) return null;

  const font = fontStack(globalStyle.fontFamily);
  const cited = cleanCitations(props.sources ?? []);
  if (cited.length === 0) return null;
  const linkInk = legibleInk(globalStyle.accentColor, props.sectionBg ?? CARD_BG, 4.5);

  const sectionStyle = {
    backgroundColor: props.sectionBg ?? CARD_BG,
    padding: sectionPad(props.paddingY),
    borderBottom: `1px solid ${BORDER}`,
  };
  const noteEl = props.note ? (
    <Text
      style={{
        fontFamily: font,
        ...text("mono"),
        color: MUTED,
        margin: space(8, 0, 0),
      }}
    >
      {props.note}
    </Text>
  ) : null;

  return (
    <Section style={sectionStyle}>
      <details>
        <summary
          style={{
            fontFamily: font,
            ...text("mono"),
            color: MUTED,
            cursor: "pointer",
          }}
        >
          Sources ({cited.length})
        </summary>
        <div style={{ marginTop: space(8) }}>
          {cited.map((c, i) =>
            c.linkable && c.href ? (
              <Text
                key={c.href ?? i}
                style={{ fontFamily: font, ...text("mono"), margin: space(0, 0, 4) }}
              >
                <Link href={c.href} style={{ color: linkInk }}>
                  {c.label}
                </Link>
              </Text>
            ) : (
              <Text
                key={`${c.label}-${i}`}
                style={{
                  fontFamily: font,
                  ...text("mono"),
                  color: MUTED,
                  margin: space(0, 0, 4),
                }}
              >
                {c.label}
              </Text>
            ),
          )}
        </div>
      </details>
      {noteEl}
    </Section>
  );
}
