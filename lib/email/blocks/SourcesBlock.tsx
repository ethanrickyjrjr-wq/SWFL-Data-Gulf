// lib/email/blocks/SourcesBlock.tsx — PURE. The "Sources" citation block, two faces:
//
// CANVAS (browser preview): a native <details>/<summary> accordion, CLOSED until
// clicked — never a wall of inline text (the operator's everywhere-rule, same as
// components/CitationList.tsx).
//
// EMAIL (emailRender — EmailDocRenderer + compile-grid): Gmail does NOT support
// <details>/<summary> — caniemail (https://www.caniemail.com, HTML5 semantics,
// verified in-session 07/19/2026) shows Gmail desktop/iOS/Android REPLACE the tags
// with <u></u>, so the "closed accordion" shipped as a permanently expanded wall
// (the 07/19 inbox complaint). No interactive collapse survives Gmail, so the sent
// email is compact BY CONSTRUCTION: one "Sources (N) — view all" line linking to
// the web home of the full list (props.viewAllUrl, e.g. the ZIP report's
// #section-sources accordion); with no URL, the first labels + a "+N more" tail on
// one line. A prior comment here claimed Gmail honors <details> — it does not.
//
// Labels/links route through the ONE citation root (lib/citations/clean-url) so a
// source here cleans identically to every other citation surface.
import { Link, Section, Text } from "@react-email/components";
import { cleanCitations } from "@/lib/citations/clean-url";
import type { EmailGlobalStyle, SourcesProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER, MUTED } from "./styles";
import { text, space } from "./scale";
import { legibleInk } from "./on-dark";

const INLINE_LABEL_CAP = 3; // no-URL email fallback: labels shown before "+N more"

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

  if (emailRender) {
    const head = `Sources (${cited.length})`;
    const inlineLabels = cited
      .slice(0, INLINE_LABEL_CAP)
      .map((c) => c.label)
      .join(" · ");
    const overflow = cited.length - INLINE_LABEL_CAP;
    return (
      <Section style={sectionStyle}>
        <Text style={{ fontFamily: font, ...text("mono"), color: MUTED, margin: 0 }}>
          {props.viewAllUrl ? (
            <>
              {head}
              {" — "}
              <Link href={props.viewAllUrl} style={{ color: linkInk }}>
                view them all &rarr;
              </Link>
            </>
          ) : (
            `${head}: ${inlineLabels}${overflow > 0 ? ` + ${overflow} more` : ""}`
          )}
        </Text>
        {noteEl}
      </Section>
    );
  }

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
        <div style={{ marginTop: 8 }}>
          {cited.map((c, i) =>
            c.linkable && c.href ? (
              <Text
                key={c.href ?? i}
                style={{ fontFamily: font, fontSize: "11px", lineHeight: "1.6", margin: "0 0 4px" }}
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
