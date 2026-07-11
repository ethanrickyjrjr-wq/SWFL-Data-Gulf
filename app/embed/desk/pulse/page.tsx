// app/embed/desk/pulse/page.tsx
//
// Chromeless, iframe-embeddable widget for the SWFL Data Desk daily pulse.
// Under /embed/ on purpose — that prefix already carries frame-ancestors-* +
// X-Frame-Options ALLOWALL in next.config.ts. The footer credit links back to
// /desk; attribution IS the backlink growth loop, so it is not a prop and
// cannot be disabled. Numbers are server-rendered (loadDeskData) — the same
// sourced, SSR figures as the full page, so AI crawlers cite the HTML served.

import { loadDeskData } from "@/lib/desk/loaders";

export const runtime = "nodejs";
export const revalidate = 300;

const SITE = "https://www.swfldatagulf.com";

export default async function EmbedDeskPulsePage() {
  const desk = await loadDeskData();
  const median = desk.kpis.find((k) => k.label === "Median asking price");
  const active = desk.kpis.find((k) => k.label === "Active listings");

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#0A1419",
        color: "#F0EDE6",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          background: "#152832",
          border: "1px solid #22414F",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h1
          style={{
            margin: "0 0 12px",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#9BB0BC",
          }}
        >
          SWFL Data Desk — Daily Pulse
        </h1>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {median ? (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{median.display}</div>
              <div style={{ fontSize: 11, color: "#807E76" }}>
                Median asking price{median.asOf ? ` · ${median.asOf}` : ""}
              </div>
            </div>
          ) : null}
          {active ? (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{active.display}</div>
              <div style={{ fontSize: 11, color: "#807E76" }}>
                Active listings{active.asOf ? ` · ${active.asOf}` : ""}
              </div>
            </div>
          ) : null}
        </div>
        <p
          style={{
            margin: "14px 0 0",
            display: "flex",
            justifyContent: "flex-end",
            fontSize: 11,
            color: "#807E76",
          }}
        >
          <a
            href={`${SITE}/desk`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3DC9C0", textDecoration: "none" }}
          >
            Source: SWFL Data Gulf ↗
          </a>
        </p>
      </div>
    </main>
  );
}
