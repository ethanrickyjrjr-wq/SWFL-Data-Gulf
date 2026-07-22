import { RadialConfidenceGauge } from "@/components/charts";
import { asOfFromToken } from "@/lib/project/as-of";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MasterPayload = {
  freshness_token?: string;
  confidence?: number;
  updated_at?: string;
};

async function fetchMaster(): Promise<MasterPayload | null> {
  try {
    const res = await fetch("https://www.swfldatagulf.com/api/b/master?view=speak&tier=2", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as MasterPayload;
  } catch {
    return null;
  }
}

const SHELL: React.CSSProperties = {
  background: "#0A1419",
  color: "#F0EDE6",
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 32,
  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const CARD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 32,
  background: "#152832",
  border: "1px solid #22414F",
  borderRadius: 12,
  padding: "24px 32px",
};

const EYEBROW: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#807E76",
};

const LINK: React.CSSProperties = {
  fontSize: 13,
  color: "var(--gulf-teal)",
  textDecoration: "none",
  marginTop: 4,
};

export default async function EmbedFooterTokenPage() {
  const master = await fetchMaster();
  const token = typeof master?.freshness_token === "string" ? master.freshness_token : null;
  const confidence = typeof master?.confidence === "number" ? master.confidence : null;

  // NO FABRICATION. This widget used to fall back to a literal
  // "SWFL-7421-vX-pending" token (lifted from a test fixture) and an invented
  // 0.78 confidence, and STILL caption itself "live" — an unsourced value
  // shipping on a public embed, which is the one hard block in our own rules.
  // When the fetch fails we do not know the freshness, so we say so. A blank
  // state is honest; a fabricated token is not.
  if (token === null || confidence === null) {
    return (
      <main style={SHELL}>
        <div style={CARD}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={EYEBROW}>SWFL Data Gulf</div>
            <div style={{ fontSize: 14, color: "#B8B4A8" }}>Freshness unavailable right now.</div>
            <a href="https://www.swfldatagulf.com/r/master" style={LINK}>
              See what we know →
            </a>
          </div>
        </div>
      </main>
    );
  }

  const confidencePct = Math.round(confidence * 100);

  return (
    <main style={SHELL}>
      <div style={CARD}>
        <RadialConfidenceGauge confidence={confidence} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={EYEBROW}>SWFL Data Gulf — live</div>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 14,
              color: "var(--gulf-teal)",
            }}
          >
            {asOfFromToken(token) ?? token}
          </div>
          <div style={{ fontSize: 14, color: "#B8B4A8" }}>
            Confidence: <span style={{ color: "#F0EDE6", fontWeight: 600 }}>{confidencePct}%</span>
          </div>
          <a href="https://www.swfldatagulf.com/r/master" style={LINK}>
            See what we know →
          </a>
        </div>
      </div>
    </main>
  );
}
