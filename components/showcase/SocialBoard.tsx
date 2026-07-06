"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Live, responsive social-example cards for the showcase overlay — replaces the
 * old single wide captured .webp, which could only be big on ONE screen size
 * (readable on desktop, a squint on phone, or vice-versa). Each format is
 * authored at its native pixel size, then scaled to fill its column, so text
 * stays crisp at any width (we only ever scale DOWN from 1080px+). The grid
 * reflows: a tidy row of equal-width, centered cards on desktop; a full-width
 * stack on phone. Symmetry comes from one shared frame system — equal card
 * width, one centerline, identical chrome — not from forcing a square and a
 * banner into the same box.
 *
 * Values are ported verbatim from the committed live-HTML boards
 * (public/showcase/<id>/live/*.html) — real, lake-sourced demo figures, nothing
 * recomputed here. Those HTML files stay the source of truth + capture input.
 */

const SAVONA_PHOTO =
  "https://d1u39ah4l74ffy.cloudfront.net/img/Mz8SOS4uLCs2DDQjJHB7fXNxdWFtY39t/476/1/1927-savona-parkway-w-cape-coral-fl-33914.webp";

/**
 * Center native-pixel artwork inside a square stage, scaled to fit (contain) and
 * kept crisp — we only ever scale DOWN from 1080px+. Every format lands on an
 * identical square, so the grid is perfectly regular whatever the aspect ratio;
 * a wide banner or a 9:16 story just sits on more mat. That regular grid is the
 * "even / symmetrical" the flat capture never had.
 */
function ContainScaled({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver's own callback (async) sets the scale — never a synchronous
    // setState in the effect body (that trips react-hooks/set-state-in-effect).
    const ro = new ResizeObserver(() =>
      setScale(Math.min(el.clientWidth / w, el.clientHeight / h)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return (
    <div ref={ref} className="absolute inset-0">
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: w,
          height: h,
          transformOrigin: "center",
          transform: `translate(-50%, -50%) scale(${scale || 0.0001})`,
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
          // hidden for the one frame before the observer reports a size
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** One labelled square stage — the shared frame every format sits on. */
function Stage({
  label,
  accent,
  w,
  h,
  children,
}: {
  label: string;
  accent: string;
  w: number;
  h: number;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <p
        className="pb-2 text-[10px] font-bold uppercase tracking-[0.22em]"
        style={{ color: accent }}
      >
        {label}
      </p>
      <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-[#0b161c]">
        <ContainScaled w={w} h={h}>
          {children}
        </ContainScaled>
      </div>
    </div>
  );
}

const S = (o: CSSProperties) => o; // brevity for inline native-px styles

function CastSignoff({ dark }: { dark: boolean }) {
  return (
    <span style={{ color: dark ? "#FFFFFF" : "#12343B", fontWeight: "bold", letterSpacing: "2px" }}>
      CAST &amp; COAST{" "}
      <span
        style={{ color: dark ? "#BFE7EA" : "#8AA3A8", fontWeight: "normal", fontSize: "0.78em" }}
      >
        REALTY
      </span>
    </span>
  );
}

// ── market-pulse (Meridian South) ────────────────────────────────────────────
const SERIF = "Georgia, 'Times New Roman', serif";

function PulseSquare() {
  return (
    <div style={S({ width: 1080, height: 1080, background: "#FAF8F4", position: "relative" })}>
      <div style={S({ background: "#1A1A18", padding: "52px 64px" })}>
        <div style={S({ fontFamily: SERIF, color: "#FAF8F4", fontSize: 34, letterSpacing: "3px" })}>
          MERIDIAN SOUTH
        </div>
        <div
          style={S({
            color: "#C4551A",
            fontSize: 24,
            fontWeight: "bold",
            letterSpacing: "4px",
            paddingTop: 10,
          })}
        >
          FORT MYERS PULSE · MAY
        </div>
      </div>
      <div style={S({ padding: "64px 64px 0" })}>
        <div style={S({ fontFamily: SERIF, color: "#1A1A18", fontSize: 52, lineHeight: 1.25 })}>
          Every ZIP eased.
          <br />
          The biggest move:
        </div>
        <div style={S({ color: "#C4551A", fontSize: 120, fontWeight: "bold", paddingTop: 24 })}>
          ▼ 0.77%
        </div>
        <div style={S({ color: "#1A1A18", fontSize: 38, fontWeight: "bold", paddingTop: 10 })}>
          ZIP 33907 · $205,799 → $204,209
        </div>
        <div style={S({ color: "#6E6A60", fontSize: 26, lineHeight: 1.6, paddingTop: 30 })}>
          April to May, home value index.
          <br />
          No ZIP rose. Drifting, not dropping.
        </div>
      </div>
      <div
        style={S({
          position: "absolute",
          bottom: 30,
          left: 64,
          right: 64,
          display: "flex",
          justifyContent: "space-between",
        })}
      >
        <div style={S({ color: "#6E6A60", fontSize: 18 })}>
          Zillow Home Value Index, through 05/31/2026
        </div>
        <div style={S({ color: "#8B8578", fontSize: 16 })}>Demo · fictional brand, real data</div>
      </div>
    </div>
  );
}

function PulseBar({ zip, pct, val }: { zip: string; pct: number; val: string }) {
  return (
    <div style={S({ display: "flex", alignItems: "center", marginTop: 16 })}>
      <div style={S({ width: 170, color: "#1A1A18", fontSize: 26, fontWeight: "bold" })}>{zip}</div>
      <div style={S({ flex: 1, background: "#E4DFD4", borderRadius: 6, height: 34 })}>
        <div style={S({ background: "#C4551A", height: 34, borderRadius: 6, width: `${pct}%` })} />
      </div>
      <div style={S({ width: 190, color: "#6E6A60", fontSize: 24, paddingLeft: 16 })}>{val}</div>
    </div>
  );
}

function PulseLandscape() {
  return (
    <div style={S({ width: 1200, height: 628, background: "#FAF8F4", position: "relative" })}>
      <div style={S({ padding: "52px 64px 0" })}>
        <div
          style={S({ color: "#C4551A", fontSize: 24, fontWeight: "bold", letterSpacing: "4px" })}
        >
          WHERE THE INDEX SITS · MAY 2026
        </div>
        <div style={S({ fontFamily: SERIF, color: "#1A1A18", fontSize: 44, paddingTop: 8 })}>
          Three Fort Myers ZIPs, three price worlds
        </div>
        <PulseBar zip="33913" pct={100} val="$440,786" />
        <PulseBar zip="33966" pct={76.8} val="$338,515" />
        <PulseBar zip="33907" pct={46.3} val="$204,209" />
      </div>
      <div
        style={S({
          position: "absolute",
          bottom: 24,
          left: 64,
          right: 64,
          display: "flex",
          justifyContent: "space-between",
        })}
      >
        <div style={S({ fontFamily: SERIF, color: "#1A1A18", fontSize: 24, letterSpacing: "2px" })}>
          MERIDIAN SOUTH{" "}
          <span style={S({ color: "#8B8578", fontSize: 18, fontFamily: "Arial" })}>ADVISORY</span>
        </div>
        <div style={S({ color: "#8B8578", fontSize: 15 })}>
          Zillow Home Value Index, 05/31/2026 · demo, real data
        </div>
      </div>
    </div>
  );
}

// ── launch-blitz (Cast & Coast) ──────────────────────────────────────────────
function pill(border: string, label: string) {
  return (
    <span
      key={label}
      style={S({
        display: "inline-block",
        background: "#FFFFFF",
        border: `3px solid ${border}`,
        color: "#12343B",
        fontSize: 30,
        fontWeight: "bold",
        padding: "12px 26px",
        borderRadius: 999,
        marginRight: 14,
      })}
    >
      {label}
    </span>
  );
}

function BlitzSquare() {
  return (
    <div style={S({ width: 1080, height: 1080, background: "#F2FAFB", position: "relative" })}>
      {/* eslint-disable-next-line @next/next/no-img-element -- demo listing photo, fixed crop */}
      <img
        src={SAVONA_PHOTO}
        alt=""
        style={S({ width: 1080, height: 560, objectFit: "cover", display: "block" })}
      />
      <div
        style={S({
          position: "absolute",
          top: 44,
          left: 44,
          background: "#FF6B57",
          color: "#FFFFFF",
          fontSize: 34,
          fontWeight: "bold",
          letterSpacing: "4px",
          padding: "16px 34px",
          borderRadius: 999,
        })}
      >
        JUST LISTED
      </div>
      <div style={S({ padding: "44px 56px 0" })}>
        <div style={S({ color: "#0E7C86", fontSize: 74, fontWeight: "bold" })}>$620,000</div>
        <div style={S({ color: "#12343B", fontSize: 38, fontWeight: "bold", paddingTop: 10 })}>
          1927 Savona Parkway W · Cape Coral
        </div>
        <div style={S({ paddingTop: 26 })}>
          {pill("#0E7C86", "3 BD")}
          {pill("#0E7C86", "2 BA")}
          {pill("#0E7C86", "1,973 SF")}
          {pill("#FF6B57", "POOL + SPA")}
        </div>
        <div style={S({ color: "#0E7C86", fontSize: 26, fontWeight: "bold", paddingTop: 30 })}>
          #CapeCoral #SWFL #JustListed #FloridaHomes
        </div>
      </div>
      <div
        style={S({
          position: "absolute",
          bottom: 26,
          left: 56,
          right: 56,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 26,
        })}
      >
        <CastSignoff dark={false} />
        <div style={S({ color: "#8AA3A8", fontSize: 15 })}>Demo · SWFL Data Gulf, 07/01/2026</div>
      </div>
    </div>
  );
}

function BlitzBar({ zip, pct, val }: { zip: string; pct: number; val: string }) {
  return (
    <div style={S({ display: "flex", alignItems: "center", marginTop: 14 })}>
      <div style={S({ width: 150, color: "#FFFFFF", fontSize: 24, fontWeight: "bold" })}>{zip}</div>
      <div
        style={S({ flex: 1, background: "rgba(255,255,255,0.18)", borderRadius: 6, height: 30 })}
      >
        <div style={S({ background: "#FFFFFF", height: 30, borderRadius: 6, width: `${pct}%` })} />
      </div>
      <div style={S({ width: 170, color: "#BFE7EA", fontSize: 22, paddingLeft: 16 })}>{val}</div>
    </div>
  );
}

function BlitzLandscape() {
  return (
    <div style={S({ width: 1200, height: 628, background: "#0E7C86", position: "relative" })}>
      <div style={S({ padding: "48px 60px 0" })}>
        <div
          style={S({ color: "#FF6B57", fontSize: 24, fontWeight: "bold", letterSpacing: "4px" })}
        >
          WHERE CAPE CORAL PRICES SIT RIGHT NOW
        </div>
        <div style={S({ color: "#FFFFFF", fontSize: 44, fontWeight: "bold", paddingTop: 8 })}>
          Six ZIPs. One honest chart.
        </div>
        <BlitzBar zip="33914" pct={100} val="$538,850" />
        <BlitzBar zip="33904" pct={92.8} val="$499,900" />
        <BlitzBar zip="33991" pct={90.7} val="$489,000" />
        <BlitzBar zip="33990" pct={79.8} val="$429,900" />
        <BlitzBar zip="33993" pct={72.2} val="$389,000" />
        <BlitzBar zip="33909" pct={67.7} val="$364,900" />
      </div>
      <div
        style={S({
          position: "absolute",
          bottom: 22,
          left: 60,
          right: 60,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 22,
        })}
      >
        <CastSignoff dark={true} />
        <div style={S({ color: "#BFE7EA", fontSize: 14 })}>
          Median asking · SWFL Data Gulf, 07/01/2026
        </div>
      </div>
    </div>
  );
}

function BlitzPortrait() {
  return (
    <div style={S({ width: 1080, height: 1350, background: "#F2FAFB", position: "relative" })}>
      <div style={S({ background: "#0E7C86", padding: "40px 56px" })}>
        <div
          style={S({ color: "#FF6B57", fontSize: 28, fontWeight: "bold", letterSpacing: "4px" })}
        >
          4 DAYS ON MARKET — AND COUNTING
        </div>
        <div
          style={S({
            color: "#FFFFFF",
            fontSize: 48,
            fontWeight: "bold",
            lineHeight: 1.2,
            paddingTop: 10,
          })}
        >
          The Cape rewards homes
          <br />
          priced with the data
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- demo listing photo, fixed crop */}
      <img
        src={SAVONA_PHOTO}
        alt=""
        style={S({ width: 1080, height: 600, objectFit: "cover", display: "block" })}
      />
      <div style={S({ padding: "44px 56px 0" })}>
        <div style={S({ color: "#12343B", fontSize: 40, fontWeight: "bold" })}>
          1927 Savona Parkway W · 33914
        </div>
        <div style={S({ color: "#0E7C86", fontSize: 62, fontWeight: "bold", paddingTop: 8 })}>
          $620,000 <span style={S({ color: "#12343B", fontSize: 32 })}>· $314/sq ft*</span>
        </div>
        <div style={S({ color: "#2E4A50", fontSize: 30, lineHeight: 1.55, paddingTop: 20 })}>
          A 3-lot site with pool + spa in the ZIP where the median ask is <strong>$538,850</strong>{" "}
          across <strong>538 active listings</strong>.
        </div>
        <div style={S({ color: "#8AA3A8", fontSize: 18, paddingTop: 20 })}>
          *List price ÷ listed sq ft.
        </div>
      </div>
      <div
        style={S({
          position: "absolute",
          bottom: 26,
          left: 56,
          right: 56,
          fontSize: 26,
        })}
      >
        <CastSignoff dark={false} />
      </div>
    </div>
  );
}

function BlitzStory() {
  return (
    <div style={S({ width: 1080, height: 1920, background: "#0E7C86", position: "relative" })}>
      {/* eslint-disable-next-line @next/next/no-img-element -- demo listing photo, fixed crop */}
      <img
        src={SAVONA_PHOTO}
        alt=""
        style={S({ width: 1080, height: 820, objectFit: "cover", display: "block", opacity: 0.92 })}
      />
      <div style={S({ padding: "70px 70px 0" })}>
        <div
          style={S({
            display: "inline-block",
            background: "#FF6B57",
            color: "#FFFFFF",
            fontSize: 34,
            fontWeight: "bold",
            letterSpacing: "5px",
            padding: "18px 40px",
            borderRadius: 999,
          })}
        >
          LAUNCH WEEKEND
        </div>
        <div
          style={S({
            color: "#FFFFFF",
            fontSize: 84,
            fontWeight: "bold",
            lineHeight: 1.12,
            paddingTop: 44,
          })}
        >
          The 3-lot
          <br />
          pool home
          <br />
          hits the Cape.
        </div>
        <div style={S({ color: "#BFE7EA", fontSize: 40, lineHeight: 1.5, paddingTop: 40 })}>
          $620,000 · 3 bd · 2 ba
          <br />
          1,973 sq ft · 0.37 acres
        </div>
        <div style={S({ color: "#FFFFFF", fontSize: 34, fontWeight: "bold", paddingTop: 56 })}>
          Swipe up for the numbers ↑
        </div>
      </div>
      <div style={S({ position: "absolute", bottom: 40, left: 70, right: 70, fontSize: 30 })}>
        <CastSignoff dark={true} />
      </div>
    </div>
  );
}

const BOARDS = {
  "market-pulse": {
    caption: "The same numbers as the email — cut for feeds.",
    cards: [
      { label: "Square · Feed", w: 1080, h: 1080, node: <PulseSquare /> },
      { label: "Landscape · Link post", w: 1200, h: 628, node: <PulseLandscape /> },
    ],
  },
  "launch-blitz": {
    caption: "One listing, four formats — the same real numbers everywhere.",
    cards: [
      { label: "Square · Feed", w: 1080, h: 1080, node: <BlitzSquare /> },
      { label: "Landscape · Link post", w: 1200, h: 628, node: <BlitzLandscape /> },
      { label: "Portrait · Feed", w: 1080, h: 1350, node: <BlitzPortrait /> },
      { label: "Story · 9:16", w: 1080, h: 1920, node: <BlitzStory /> },
    ],
  },
} as const;

export function SocialBoard({
  board,
  accent,
}: {
  board: "market-pulse" | "launch-blitz";
  accent: string;
}) {
  const spec = BOARDS[board];
  return (
    <div className="w-full">
      <p className="mb-4 text-xs text-gray-400">{spec.caption}</p>
      {/* 2-up only when the modal is genuinely wide — below lg the caption
          column already eats the width, so a 2-col grid would shrink each card
          back into a squint. 1-up keeps every card big on phone + narrow. */}
      <div className="grid grid-cols-1 gap-x-5 gap-y-6 lg:grid-cols-2">
        {spec.cards.map((c) => (
          <Stage key={c.label} label={c.label} accent={accent} w={c.w} h={c.h}>
            {c.node}
          </Stage>
        ))}
      </div>
    </div>
  );
}
