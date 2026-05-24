import fs from "node:fs/promises";
import path from "node:path";
import { CorridorRentChart, ZHVIAreaChart } from "@/components/viz";
import type { CorridorEntry, ZHVITrendEntry, ZHVIMonth } from "@/types/viz";

export const dynamic = "force-static";
export const revalidate = 3600;

async function loadFixture<T>(name: string): Promise<T> {
  const file = path.join(process.cwd(), "fixtures", name);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}

export default async function EmbedChartsPage() {
  const [zhviRaw, corridors] = await Promise.all([
    loadFixture<ZHVIMonth[]>("zhvi-trend.json"),
    loadFixture<CorridorEntry[]>("corridors.json"),
  ]);

  const zhvi: ZHVITrendEntry[] = zhviRaw.filter(
    (m): m is ZHVITrendEntry =>
      m.cape_coral != null && m.fort_myers != null && m.naples != null,
  );

  return (
    <main
      style={{
        background: "#0A1419",
        color: "#F0EDE6",
        minHeight: "100dvh",
        padding: "32px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))",
          gap: "24px",
          maxWidth: "1280px",
          margin: "0 auto",
        }}
      >
        <section
          style={{
            background: "#152832",
            border: "1px solid #22414F",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <header style={{ marginBottom: 16 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: "#F0EDE6",
              }}
            >
              Home values across SWFL
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#807E76",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              Zillow ZHVI · Cape Coral · Fort Myers · Naples
            </p>
          </header>
          <ZHVIAreaChart data={zhvi} loading={false} />
        </section>

        <section
          style={{
            background: "#152832",
            border: "1px solid #22414F",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <header style={{ marginBottom: 16 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: "#F0EDE6",
              }}
            >
              CRE corridor asking rents
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#807E76",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              26 corridors · NNN $/sqft · click a bar for detail
            </p>
          </header>
          <CorridorRentChart data={corridors} loading={false} />
        </section>
      </div>
    </main>
  );
}
