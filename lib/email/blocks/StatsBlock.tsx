// lib/email/blocks/StatsBlock.tsx — PURE. 2–3 KPI cells side by side; inside a
// narrow grid column the same cells STACK vertically instead. HTML tables expand
// past width:100% when an unbreakable 32px value can't fit its cell — that
// expansion pushed every half-width stats seed ~100px past the 600px container
// (the stair-stepped captures of 07/10/2026).
import type { CSSProperties } from "react";
import { Section, Row, Column, Text } from "@react-email/components";
import type { EmailGlobalStyle, StatItem, StatsProps } from "../doc/types";
import { GRID_WIDTH } from "../grid-schema";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { EditableText, type EditScope } from "./editable-text";
import { OPEN_SLOT_INK } from "./OpenSlot";
import {
  text,
  label,
  statRole,
  lines,
  pad,
  space,
  WEIGHT,
  TYPE,
  METRIC_ROW_PAD,
  type TypeRole,
} from "./scale";

/** Side-by-side needs ~180px per cell for a "$630,000"-class value at 32px.
 *  Full width (600/3 = 200) keeps the classic row; any grid column tighter
 *  than that per cell stacks. */
const MIN_CELL_PX = 180;

/** The strip Section's HORIZONTAL padding. ONE constant, because the wrapped-cell arithmetic
 *  below must subtract exactly what the Section adds: a cell width computed against the full
 *  600px canvas overflows the real 568px content box, and the sixth cell drops to its own line
 *  ON DESKTOP — which is the bug the wrap was supposed to fix, moved one layer down. */
const STRIP_PAD_X = 16;

/** A React style object → an inline CSS string. Every value the scale hands us is ALREADY a
 *  string ("16px", "1.55" — see `text()` in scale.ts), so this is a pure key transform with no
 *  unit guessing. It exists so the wrapped email cells below reuse the SAME style objects the
 *  React path builds — one styling authority, not a second one that drifts. */
function cssText(style: CSSProperties): string {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${String(v)}`)
    .join(";");
}

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function StatsBlock({
  props,
  globalStyle,
  colPx,
  emailRender,
  scope,
}: {
  props: StatsProps;
  globalStyle: EmailGlobalStyle;
  /** Rendered column width in px when the block sits in a grid column
   *  (compile-grid passes it; the free stacker and the canvas don't). */
  colPx?: number;
  /** True on the sendable-HTML paths — THE OPEN-SLOT CONTRACT: a cell we could not
   *  source is an invitation to the USER, never a naked label (and never a zero) to
   *  a recipient. An unsourced cell is dropped here; a row with no surviving cell
   *  does not exist at all. */
  emailRender?: boolean;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  // Keep each cell's ORIGINAL index — the canvas edit paths (`stats.<i>.value`)
  // address props.stats, so filtering must never renumber them.
  const cells = (props.stats ?? [])
    .map((stat, i) => ({ stat, i, empty: !(stat.value ?? "").trim() }))
    .filter((c) => !(emailRender && c.empty));

  // Every cell in this row was unsourced → the row itself does not exist in the email.
  if (emailRender && cells.length === 0) return null;

  const stacked = colPx !== undefined && cells.length > 0 && colPx / cells.length < MIN_CELL_PX;
  const sectionStyle = {
    backgroundColor: props.sectionBg ?? globalStyle.surfaceColor ?? CARD_BG,
    padding: sectionPad(props.paddingY),
    borderBottom: `1px solid ${BORDER}`,
  };

  // ── WHICH NUMBER MATTERS (07/13/2026) ───────────────────────────────────────
  // Operator: "we need to make numbers different sizes and maybe colors in accordance
  // with importance… just looks bad." He was right, and the cause was structural: every
  // cell rendered at identical weight and colour, so $209/sq ft (which wins a listing
  // argument) looked exactly like "Type: Residential" (which nobody cares about).
  //
  // `emphasis` is per-cell and OPTIONAL — an undefined cell renders exactly as before.
  //   primary → larger, in the ACCENT colour. The one the eye should land on.
  //   muted   → smaller and quieter. Present, but not competing.
  // ── IT WAS INVERTED, AND IT WAS DROPPED (both fixed 07/14/2026) ─────────────
  //
  // The old sizeFor() read:
  //     primary → strip ? 20px : 30px    muted → strip ? 13px : 18px    base → 32px (grid)
  //
  // So in the GRID variant a `primary` cell rendered at 30px while a PLAIN cell
  // rendered at 32px — THE IMPORTANT NUMBER WAS SMALLER THAN THE BORING ONE. The
  // dial ran backwards, and only won on colour. And the STACKED path below called
  // valueStyle(empty, "22px") with no emphasis argument at all, so it dropped the
  // dial entirely — the exact path a narrow multi-column column triggers, i.e. the
  // path the fence system exists to produce.
  //
  // Now: `statRole()` (scale.ts) is monotonic BY CONSTRUCTION — primary > plain >
  // muted, at every density, pinned by scale.test.ts. Density is the `strip` flag:
  // a strip walks one step DOWN the real ladder rather than inventing 20/13/17/9px.
  const density = props.variant === "strip" ? "strip" : "grid";
  const colorFor = (e: StatItem["emphasis"]) =>
    e === "primary" ? globalStyle.accentColor : e === "muted" ? MUTED : globalStyle.primaryColor;

  // An open cell on the canvas: the label stays (it IS the instruction — "Baths"
  // tells the user what to type) and the value wears a dashed "fill me" outline with
  // an add affordance instead of a "0" placeholder that reads as a real figure.
  //
  // `numeric: true` — a stat value is ALWAYS a figure, and the design system requires
  // tabular figures on every numeric cell so columns of numbers align. Before today
  // that rule had zero implementations anywhere in the email renderer.
  // ── THE LABEL BASELINE (07/14/2026) ─────────────────────────────────────────
  //
  // Making the important number BIGGER immediately staggered the label row: with
  // $209 at a taller step than "3" and "Residential", each cell's label sat at a
  // different height and the row read as ragged — the exact "uneven" complaint,
  // reappearing one layer down. Emphasis without a shared baseline just moves the
  // mess around.
  //
  // So the VALUE ROW reserves ONE line box, sized at the tallest step present in
  // THIS row. Every label then starts at the same y, whatever the emphasis. Derived
  // from the scale (`lines()`), never a hand-typed height, so it tracks the type.
  const tallest = cells.reduce<TypeRole>(
    (max, { stat }) => {
      const r = statRole(stat.emphasis, density);
      return TYPE[r] > TYPE[max] ? r : max;
    },
    statRole(undefined, density),
  );

  const valueStyle = (empty: boolean, emphasis?: StatItem["emphasis"]) => ({
    fontFamily: font,
    ...(empty && scope
      ? text("body", { weight: WEIGHT.emphasis })
      : text(statRole(emphasis, density), { numeric: true })),
    color: empty && scope ? MUTED : colorFor(emphasis),
    margin: 0,
    // One shared line box → one shared label baseline across the whole row.
    minHeight: lines(tallest, 1),
    ...(empty && scope ? { ...OPEN_SLOT_INK, padding: pad(4, 8) } : {}),
  });

  if (stacked) {
    return (
      <Section style={sectionStyle} data-stats-variant="stacked">
        {cells.map(({ stat, i, empty }, pos) => (
          <Row key={i}>
            <Column
              style={{
                textAlign: "left",
                padding: pos === cells.length - 1 ? pad(4, 8) : space(4, 8, 16),
              }}
            >
              <EditableText
                as={Text}
                value={stat.value}
                path={`stats.${i}.value`}
                scope={scope}
                placeholder="+ Add"
                style={valueStyle(empty, stat.emphasis)}
              />
              <EditableText
                as={Text}
                value={stat.label}
                path={`stats.${i}.label`}
                scope={scope}
                placeholder="Label"
                style={{ fontFamily: font, ...label(), color: MUTED, margin: space(4, 0, 0) }}
              />
            </Column>
          </Row>
        ))}
      </Section>
    );
  }

  // THE SPEC STRIP — one delicate hairline-ruled row, the spec line a real listing flyer
  // runs under the price. Five cells in a STRIP read as a spec line; five cells in a GRID
  // read as a wall. Same data, entirely different email.
  if (density === "strip") {
    const stripSection = {
      ...sectionStyle,
      borderTop: `1px solid ${globalStyle.accentColor}`,
      borderBottom: `1px solid ${globalStyle.accentColor}`,
      padding: pad(12, STRIP_PAD_X),
    };
    const labelStyle = {
      fontFamily: font,
      ...label(),
      color: MUTED,
      margin: space(4, 0, 0),
    } as CSSProperties;

    // ── THE STRIP MUST WRAP, AND A TABLE CANNOT (07/14/2026) ────────────────────
    //
    // A stats row is an HTML table, and a table does not reflow: six cells laid out for a
    // 600px canvas simply RUN OFF a 390px phone — "Residential" clipped at the edge and the
    // whole email scrolling sideways (operator, 07/14/2026). `MIN_CELL_PX` never caught this,
    // because it keys off `colPx`, and compile-grid only passes `colPx` on the MULTI-COLUMN
    // path — a full-bleed row passes `undefined`, so `stacked` was ALWAYS false here.
    //
    // The fix is the same Cerberus hybrid the compiler already uses for columns: each cell is
    // an `inline-block` capped at its share of the row. At 600px the arithmetic is exact
    // (6 × 100 = 600) so THE DESKTOP STRIP IS UNCHANGED; on a phone `width:100%` overflows the
    // room and the cells WRAP (3 + 3) with no media query. Outlook ignores `inline-block`, so
    // the ghost table pins its widths — which is why this is assembled as a STRING: MSO
    // conditionals are HTML comments, and React strips those (same reason `compile-grid` and
    // `email-head` do it this way).
    //
    // The CANVAS keeps the React table below — it is editable, and it is never below 600px.
    if (emailRender && cells.length > 0) {
      // The cells share the Section's CONTENT box, not the canvas — 600 − (2 × 16) = 568.
      // Compute against 600 and six 100px cells sum to 600, the row overflows by 32px, and the
      // sixth cell wraps ON DESKTOP. Measured, not assumed (07/14/2026).
      const rowPx = (colPx ?? GRID_WIDTH) - STRIP_PAD_X * 2;
      const cellPx = Math.floor(rowPx / cells.length);
      const labelCss = cssText(labelStyle);
      // KNOWN TENSION, stated because the next person WILL hit it. A wrapped cell is a FIXED
      // 568/n px, where the old table auto-sized each column to its content — stealing width
      // from "BEDS" to give it to "MEDIAN DAYS ON MARKET". At n=6 that is 94px, and a long
      // label or a two-word emphasised value ("83 days") wraps where it used to fit. Tightening
      // this padding does NOT buy enough to change that (tried, 07/14/2026).
      //
      // It is harmless for the LISTING campaign (Beds/Baths/Sq Ft/Lot/$/Sq Ft/Type are short)
      // and visible in templates with 4-word labels. The fix there is the CONTENT — put the
      // unit in the label, not the value ("83" + "DAYS ON MARKET", the convention every other
      // cell already follows) — not more mechanism here.
      const cellPad = pad(4, 8);

      let html =
        `<!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" ` +
        `width="${rowPx}" style="width:${rowPx}px;"><tr><![endif]-->`;
      for (const { stat, empty } of cells) {
        html +=
          `<!--[if mso]><td width="${cellPx}" valign="top" style="vertical-align:top;text-align:center;"><![endif]-->` +
          `<div style="display:inline-block;width:100%;max-width:${cellPx}px;vertical-align:top;` +
          `text-align:center;padding:${cellPad};box-sizing:border-box;">` +
          `<p style="${cssText(valueStyle(empty, stat.emphasis))}">${escHtml(stat.value ?? "")}</p>` +
          `<p style="${labelCss}">${escHtml(stat.label ?? "")}</p>` +
          `</div>` +
          `<!--[if mso]></td><![endif]-->`;
      }
      html += `<!--[if mso]></tr></table><![endif]-->`;

      return (
        <Section style={stripSection} data-stats-variant="strip">
          {/* font-size:0 kills the whitespace gap between inline-blocks; each cell sets its
              own step from the scale. */}
          <div
            style={{ fontSize: 0, textAlign: "center" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {props.footnote ? (
            <Text
              style={{
                fontFamily: font,
                ...text("mono"),
                color: MUTED,
                textAlign: "center",
                margin: space(8, 0, 0),
              }}
            >
              {props.footnote}
            </Text>
          ) : null}
        </Section>
      );
    }

    return (
      <Section style={stripSection} data-stats-variant="strip">
        <Row>
          {cells.map(({ stat, i, empty }) => (
            <Column key={i} style={{ textAlign: "center", padding: pad(4, 8) }}>
              <EditableText
                as={Text}
                value={stat.value}
                path={`stats.${i}.value`}
                scope={scope}
                placeholder="+ Add"
                style={valueStyle(empty, stat.emphasis)}
              />
              <EditableText
                as={Text}
                value={stat.label}
                path={`stats.${i}.label`}
                scope={scope}
                placeholder="Label"
                style={labelStyle}
              />
            </Column>
          ))}
        </Row>
        {/* The provenance of a DERIVED cell, stated where the reader can see it — the
            sample says "*Computed from list price ÷ listed square footage" and it should. */}
        {props.footnote ? (
          <Text
            style={{
              fontFamily: font,
              ...text("mono"),
              color: MUTED,
              textAlign: "center",
              margin: space(8, 0, 0),
            }}
          >
            {props.footnote}
          </Text>
        ) : null}
      </Section>
    );
  }

  return (
    <Section style={sectionStyle}>
      <Row>
        {cells.map(({ stat, i, empty }) => (
          <Column key={i} style={{ textAlign: "center", padding: pad(METRIC_ROW_PAD, 8) }}>
            <EditableText
              as={Text}
              value={stat.value}
              path={`stats.${i}.value`}
              scope={scope}
              placeholder="+ Add"
              style={valueStyle(empty, stat.emphasis)}
            />
            <EditableText
              as={Text}
              value={stat.label}
              path={`stats.${i}.label`}
              scope={scope}
              placeholder="Label"
              style={{ fontFamily: font, ...label(), color: MUTED, margin: space(4, 0, 0) }}
            />
          </Column>
        ))}
      </Row>
    </Section>
  );
}
