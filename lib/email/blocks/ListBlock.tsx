// lib/email/blocks/ListBlock.tsx — PURE. A titled row list (events, tips).
//
// Email-safe: rows are a real <table> (no <ul> — bullet spacing is uneven across
// clients). `lead` is a short bold prefix cell (a date tag, a rank); rows with no
// lead span the full width. Renders nothing when items is empty.
import { Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, ListProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER } from "./styles";
import { isDarkBg, legibleAccent, ON_DARK_BODY, ON_DARK_TITLE } from "./on-dark";

export function ListBlock({
  props,
  globalStyle,
}: {
  props: ListProps;
  globalStyle: EmailGlobalStyle;
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
      {props.title ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "17px",
            fontWeight: 700,
            color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
            margin: "0 0 10px",
          }}
        >
          {props.title}
        </Text>
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
                    color: onDark
                      ? legibleAccent(globalStyle.accentColor, bg)
                      : globalStyle.accentColor,
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                    padding: "5px 10px 5px 0",
                  }}
                >
                  {item.lead}
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
                {item.text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
