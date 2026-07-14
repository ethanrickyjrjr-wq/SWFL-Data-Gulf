// lib/email/blocks/ListBlock.tsx — PURE. A titled row list (events, tips).
//
// Email-safe: rows are a real <table> (no <ul> — bullet spacing is uneven across
// clients). `lead` is a short bold prefix cell (a date tag, a rank); rows with no
// lead span the full width. Renders nothing when items is empty.
import { Section, Text, Link } from "@react-email/components";
import type { EmailGlobalStyle, ListProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER } from "./styles";
import { isDarkBg, legibleAccent, legibleInk, ON_DARK_BODY, ON_DARK_TITLE } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function ListBlock({
  props,
  globalStyle,
  scope,
}: {
  props: ListProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const items = props.items ?? [];
  if (items.length === 0 && !props.title) return null;
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
      {props.title || scope ? (
        <EditableText
          as={Text}
          value={props.title ?? ""}
          path="title"
          scope={scope}
          placeholder="List title"
          style={{
            fontFamily: font,
            fontSize: "17px",
            fontWeight: 700,
            color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
            margin: "0 0 10px",
          }}
        />
      ) : null}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              {item.lead ? (
                <td
                  style={{
                    fontFamily: font,
                    fontSize: "13px",
                    fontWeight: 700,
                    // ⚠️ SUPERSEDED BY THE SCALE ROOT. This 24px is a magic number — the correct
                    // fix is `lib/email/blocks/scale.ts`, where a size cannot be chosen without
                    // its line-height. Delete this literal when the blocks adopt the scale.
                    //
                    // THE RAGGED ROW. The lead had no line-height, so its 13px text sat in a
                    // ~16px line box while the 15px body cell beside it sat in a 24px one
                    // (15 × 1.6). Both cells are top-aligned, so the two line boxes started
                    // together and their BASELINES landed ~5px apart — the price floated
                    // above the address it belongs to ("Recent sales nearby" read as two
                    // columns that had drifted). Pinning the lead to the body's line box
                    // (15px × 1.6 = 24px) puts both baselines on the same line.
                    lineHeight: "24px",
                    color: onDark
                      ? legibleAccent(globalStyle.accentColor, bg)
                      : globalStyle.accentColor,
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                    padding: "5px 10px 5px 0",
                  }}
                >
                  <EditableText value={item.lead ?? ""} path={`items.${i}.lead`} scope={scope} />
                </td>
              ) : null}
              <td
                colSpan={item.lead ? 1 : 2}
                style={{
                  fontFamily: font,
                  fontSize: "15px",
                  lineHeight: "1.6",
                  color: onDark ? ON_DARK_BODY : globalStyle.textColor,
                  verticalAlign: "top",
                  padding: "5px 0",
                  width: "100%",
                }}
              >
                <EditableText
                  value={item.text}
                  path={`items.${i}.text`}
                  scope={scope}
                  placeholder="Row text…"
                />
                {item.linkUrl ? (
                  <>
                    {"  "}
                    <Link
                      href={item.linkUrl}
                      style={{
                        fontFamily: font,
                        fontSize: "13px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        color: onDark
                          ? legibleAccent(globalStyle.accentColor, bg)
                          : legibleInk(globalStyle.accentColor, bg, 4.5),
                      }}
                    >
                      View →
                    </Link>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
