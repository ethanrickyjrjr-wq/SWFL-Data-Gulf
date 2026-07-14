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
import { text, pad, space, WEIGHT, TABLE_ROW_PAD } from "./scale";

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
            ...text("h2"),
            color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
            margin: space(0, 0, 8),
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
                    // THE RAGGED ROW, FIXED AT THE ROOT. The lead (the price) and the body
                    // cell (the address) are PEERS ON ONE LINE — so they take the SAME type
                    // step, and the lead is distinguished by WEIGHT and COLOUR, not by size.
                    // Identical step → identical line box → baselines align by construction.
                    //
                    // The earlier fix pinned the lead to `lineHeight: "24px"` — a magic number
                    // that only worked because the body cell happened to be 15px × 1.6. It
                    // would have silently re-broken the moment either size moved. This cannot.
                    ...text("body", { weight: WEIGHT.emphasis, numeric: true }),
                    color: onDark
                      ? legibleAccent(globalStyle.accentColor, bg)
                      : globalStyle.accentColor,
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                    padding: space(TABLE_ROW_PAD, 8, TABLE_ROW_PAD, 0),
                  }}
                >
                  <EditableText value={item.lead ?? ""} path={`items.${i}.lead`} scope={scope} />
                </td>
              ) : null}
              <td
                colSpan={item.lead ? 1 : 2}
                style={{
                  fontFamily: font,
                  ...text("body"),
                  color: onDark ? ON_DARK_BODY : globalStyle.textColor,
                  verticalAlign: "top",
                  padding: pad(TABLE_ROW_PAD, 0),
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
                        ...text("caption", { weight: WEIGHT.emphasis }),
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
