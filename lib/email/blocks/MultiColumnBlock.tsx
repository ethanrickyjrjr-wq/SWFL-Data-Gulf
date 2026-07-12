// lib/email/blocks/MultiColumnBlock.tsx — PURE. A 2–3 column row.
//
// Responsive without media queries (Cerberus "fluid hybrid", verified via
// crawl4ai 06/28/2026 — cerberusemail.com/hybrid-responsive): each column is an
// inline-block div with width:100% capped by max-width, so on a wide canvas they
// sit side by side and on a narrow (mobile) viewport they wrap to one column. The
// `font-size:0` wrapper removes the whitespace gap between inline-blocks; each
// column resets its own font-size. Degrades to stacked in desktop Outlook (which
// ignores inline-block) — acceptable; the paid grid + build-02 compile-grid own
// the ghost-table upgrade for forced Outlook side-by-side.
import { Section, Img, Text, Link } from "@react-email/components";
import type { EmailGlobalStyle, MultiColumnProps } from "../doc/types";
import { fontStack, sectionPad, BORDER, CARD_BG } from "./styles";
import { isDarkBg, legibleAccent, ON_DARK_BODY, ON_DARK_TITLE } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function MultiColumnBlock({
  props,
  globalStyle,
  scope,
}: {
  props: MultiColumnProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const columns = props.columns ?? [];
  const threeUp = columns.length >= 3;
  // Desktop column width inside the 600px canvas (minus the 28px section padding).
  const maxW = threeUp ? 176 : 260;
  const minW = threeUp ? 150 : 200;
  const bg = props.sectionBg ?? CARD_BG;
  const onDark = isDarkBg(bg);

  return (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ fontSize: 0, textAlign: "center" }}>
        {columns.map((c, i) => (
          <div
            key={i}
            style={{
              display: "inline-block",
              verticalAlign: "top",
              width: "100%",
              maxWidth: `${maxW}px`,
              minWidth: `${minW}px`,
              boxSizing: "border-box",
              padding: "0 8px",
              textAlign: "left",
            }}
          >
            {c.imageUrl ? (
              <Img
                src={c.imageUrl}
                alt={c.heading ?? ""}
                width={maxW}
                // Fixed height + cover (AgentHeroBlock precedent): mixed-aspect
                // card photos otherwise start each column's heading at a
                // different y — the ragged feature row in the 07/10/2026
                // magazine-issue capture. Outlook ignores object-fit and shows
                // the natural aspect scaled to width — acceptable degrade.
                style={{
                  width: "100%",
                  height: `${threeUp ? 110 : 160}px`,
                  objectFit: "cover",
                  display: "block",
                  borderRadius: "6px",
                  marginBottom: "8px",
                }}
              />
            ) : null}

            {c.heading || scope ? (
              <EditableText
                as={Text}
                value={c.heading ?? ""}
                path={`columns.${i}.heading`}
                scope={scope}
                placeholder="Heading"
                style={{
                  fontFamily: font,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
                  margin: "0 0 4px",
                }}
              />
            ) : null}

            {c.body || scope ? (
              <EditableText
                as={Text}
                value={c.body ?? ""}
                path={`columns.${i}.body`}
                scope={scope}
                multiline
                placeholder="Body…"
                style={{
                  fontFamily: font,
                  fontSize: "13px",
                  lineHeight: "1.6",
                  color: onDark ? ON_DARK_BODY : globalStyle.textColor,
                  margin: 0,
                }}
              />
            ) : null}

            {c.linkUrl ? (
              <Text style={{ margin: "6px 0 0" }}>
                <Link
                  href={c.linkUrl}
                  style={{
                    fontFamily: font,
                    fontSize: "13px",
                    fontWeight: 600,
                    color: onDark
                      ? legibleAccent(globalStyle.accentColor, bg)
                      : globalStyle.accentColor,
                  }}
                >
                  <EditableText
                    value={c.linkLabel || "Learn more"}
                    path={`columns.${i}.linkLabel`}
                    scope={scope}
                  />
                  {" →"}
                </Link>
              </Text>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}
