import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { coverageSources, type CoverageSource } from "./_coverage";
import {
  buildWorkOrder,
  classify,
  formatSpans,
  toYear,
  type ClassifiedRow,
  type HealthStatus,
  type SourceProbe,
} from "./health";
import { ChaseListButton } from "./chase-list-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache — reflect live DB state

// ── data fetching ────────────────────────────────────────────────────────────

/** UTC-date day difference, matching the probe's `(today - last_run).days`. */
function ageInDays(iso: string, now: Date): number {
  const d = new Date(iso);
  const load = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.floor((today - load) / 86_400_000);
}

async function latestLoad(
  sb: SupabaseClient,
  source: CoverageSource,
): Promise<string | null> {
  // Tier-1: _tier1_inventory.updated_at by inventory_id (exact or prefix).
  if (source.lane === "tier-1" || source.lane === "tier-1-duckdb") {
    if (!source.inventory_id) return null;
    let q = sb
      .schema("data_lake")
      .from("_tier1_inventory")
      .select("updated_at");
    q =
      source.inventory_key_type === "prefix"
        ? q.like("id", `${source.inventory_id}%`)
        : q.eq("id", source.inventory_id);
    const { data } = await q
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { updated_at?: string } | null)?.updated_at ?? null;
  }
  // Tier-2 non-dlt: MAX(inserted_at) on the freshness_table.
  if (source.freshness_table) {
    const [sch, tbl] = source.freshness_table.split(".", 2);
    const { data } = await sb
      .schema(sch)
      .from(tbl)
      .select("inserted_at")
      .order("inserted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { inserted_at?: string } | null)?.inserted_at ?? null;
  }
  // Tier-2 dlt: MAX(inserted_at) on _dlt_loads for this schema_name (status 0).
  if (source.dlt_schema_name) {
    const { data } = await sb
      .schema("data_lake")
      .from("_dlt_loads")
      .select("inserted_at")
      .eq("schema_name", source.dlt_schema_name)
      .eq("status", 0)
      .order("inserted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { inserted_at?: string } | null)?.inserted_at ?? null;
  }
  return null;
}

async function boundYear(
  sb: SupabaseClient,
  source: CoverageSource,
  ascending: boolean,
): Promise<number | null> {
  if (!source.schema || !source.table || !source.dateCol || !source.dateKind) {
    return null;
  }
  const { data } = await sb
    .schema(source.schema)
    .from(source.table)
    .select(source.dateCol)
    .order(source.dateCol, { ascending, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  const val = row?.[source.dateCol];
  if (val === null || val === undefined) return null;
  return toYear(val as string | number, source.dateKind);
}

async function probeSource(
  sb: SupabaseClient,
  source: CoverageSource,
  now: Date,
): Promise<SourceProbe> {
  const base: SourceProbe = {
    name: source.name,
    label: source.label,
    brainId: source.brainId,
    brainIsLive: source.brainIsLive,
    lane: source.lane,
    schema: source.schema,
    table: source.table,
    notYetRunning: source.not_yet_running,
    note: source.note,
    cadenceDays: source.cadence_days,
    toleranceMultiplier: source.tolerance_multiplier,
    expectedRowsMin: source.expected_rows_min,
    rowCount: null,
    queryFailed: false,
    lastLoad: null,
    ageDays: null,
    minYear: null,
    maxYear: null,
    untracked: source.untracked,
  };

  try {
    base.lastLoad = await latestLoad(sb, source);
    base.ageDays = base.lastLoad ? ageInDays(base.lastLoad, now) : null;
  } catch {
    base.lastLoad = null;
    base.ageDays = null;
  }

  // Coverage + row count only for tier-2 (Parquet has no SQL table).
  if (source.lane === "tier-2" && source.schema && source.table) {
    try {
      const { count, error } = await sb
        .schema(source.schema)
        .from(source.table)
        .select("*", { count: "exact", head: true });
      if (error) {
        base.queryFailed = true;
      } else {
        base.rowCount = count ?? 0;
      }
    } catch {
      base.queryFailed = true;
    }
    if (!base.queryFailed && source.dateCol) {
      try {
        const [minYear, maxYear] = await Promise.all([
          boundYear(sb, source, true),
          boundYear(sb, source, false),
        ]);
        base.minYear = minYear;
        base.maxYear = maxYear;
      } catch {
        // leave year bounds null — coverage cell shows "—"
      }
    }
  }

  return base;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function DataCoveragePage() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const generatedDate = now.toISOString().slice(0, 10);

  let sb: SupabaseClient;
  try {
    sb = createServiceRoleClient();
  } catch {
    return (
      <CredsPanel message="Server is missing Supabase credentials; coverage is unavailable in this environment." />
    );
  }

  const sources = coverageSources();
  const probes = await Promise.all(sources.map((s) => probeSource(sb, s, now)));
  const rows = probes.map((p) => classify(p, currentYear));

  const tierA = rows
    .filter((r) => r.tier === "A")
    .sort((a, b) => b.severity - a.severity);
  const tierC = rows.filter((r) => r.tier === "C");
  const tierD = rows.filter((r) => r.tier === "D");
  const untracked = rows.filter((r) => r.probe.untracked);

  const workOrder = buildWorkOrder(rows, {
    generatedDate,
    totalSources: rows.length,
  });
  const chaseCount = rows.filter((r) => r.verb !== null).length;

  const counts = {
    total: rows.length,
    fresh: tierD.length,
    stale: rows.filter((r) => r.status === "STALE").length,
    belowFloor: rows.filter((r) => r.status === "LOW_VOLUME").length,
    emptyMissing: rows.filter(
      (r) => r.status === "EMPTY" || r.status === "MISSING",
    ).length,
    parked: tierC.length,
    untracked: rows.filter((r) => r.probe.untracked).length,
  };

  return (
    <div className="min-h-dvh bg-white font-sans text-zinc-900">
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <header className="border-b border-zinc-200 pb-6">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Data lake coverage
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            What we have, what we&rsquo;re missing
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
            Per-source coverage (years 2020&ndash;{currentYear}) and freshness
            for every active ingest pipeline, reflecting the live database on
            each load. Freshness mirrors the daily probe exactly; the chase list
            ranks what to act on first.
          </p>
        </header>

        <HeadlineStrip counts={counts} />

        <section className="mt-8 flex flex-wrap items-center gap-4">
          <ChaseListButton markdown={workOrder} count={chaseCount} />
          <span className="text-sm text-zinc-500">
            Copies a GRAB / FIX / FIND / ROUTE work order you can paste into an
            issue or a Claude session.
          </span>
        </section>

        <TierSection
          title="Act now"
          subtitle="Active pipelines that are broken, stale, short, or missing a recent year — ranked by urgency."
          rows={tierA}
          currentYear={currentYear}
          empty="Nothing urgent — every active pipeline is fresh and complete."
        />

        <TierSection
          title="Known-blocked / parked"
          subtitle="Tracked, not chased: source blocked, or pipeline registered but not yet running. Shown with the registry's reason."
          rows={tierC}
          currentYear={currentYear}
          showNote
          empty="No parked or blocked sources."
        />

        <details className="mt-10 rounded-lg border border-zinc-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700">
            Healthy ({tierD.length})
          </summary>
          <div className="px-1 pb-2">
            <CoverageTable rows={tierD} currentYear={currentYear} />
          </div>
        </details>

        <OrphanFootnote untrackedCount={untracked.length} />
      </main>
    </div>
  );
}

// ── sections & cells ──────────────────────────────────────────────────────────

function HeadlineStrip({
  counts,
}: {
  counts: {
    total: number;
    fresh: number;
    stale: number;
    belowFloor: number;
    emptyMissing: number;
    parked: number;
    untracked: number;
  };
}) {
  const items: Array<[string, number, string]> = [
    ["sources", counts.total, "text-zinc-900"],
    ["fresh", counts.fresh, "text-emerald-600"],
    ["stale", counts.stale, "text-amber-600"],
    ["below floor", counts.belowFloor, "text-amber-600"],
    ["empty/missing", counts.emptyMissing, "text-red-600"],
    ["parked", counts.parked, "text-zinc-500"],
    ["untracked", counts.untracked, "text-red-600"],
  ];
  return (
    <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-4">
      {items.map(([label, n, color]) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className={`text-2xl font-semibold tabular-nums ${color}`}>
            {n}
          </span>
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function TierSection({
  title,
  subtitle,
  rows,
  currentYear,
  showNote,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: ClassifiedRow[];
  currentYear: number;
  showNote?: boolean;
  empty: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-zinc-500">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          {empty}
        </p>
      ) : (
        <CoverageTable
          rows={rows}
          currentYear={currentYear}
          showNote={showNote}
        />
      )}
    </section>
  );
}

function CoverageTable({
  rows,
  currentYear,
  showNote,
}: {
  rows: ClassifiedRow[];
  currentYear: number;
  showNote?: boolean;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-100 text-xs uppercase tracking-wider text-zinc-600">
          <tr>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Brain</th>
            <th className="px-4 py-3 font-medium">In lake</th>
            <th className="px-4 py-3 font-medium">Freshness</th>
            <th className="px-4 py-3 font-medium">
              Missing (2020&ndash;{currentYear})
            </th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {rows.map((r) => (
            <tr key={r.probe.name} className="align-top">
              <td className="px-4 py-3">
                <div className="font-medium text-zinc-900">{r.probe.label}</div>
                <div className="font-mono text-[11px] text-zinc-400">
                  {r.probe.schema && r.probe.table
                    ? `${r.probe.schema}.${r.probe.table}`
                    : r.probe.lane}
                </div>
                {showNote && r.probe.note && (
                  <div className="mt-1 max-w-md text-xs italic text-zinc-500">
                    {r.probe.note}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                {r.probe.brainId ? (
                  <a
                    href={`/r/${r.probe.brainId}`}
                    className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-700"
                  >
                    {r.probe.brainId}
                  </a>
                ) : (
                  <span className="text-zinc-400">— none</span>
                )}
              </td>
              <td className="px-4 py-3">{inLakeCell(r)}</td>
              <td className="px-4 py-3">{freshnessCell(r)}</td>
              <td className="px-4 py-3">{missingCell(r)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function inLakeCell(r: ClassifiedRow) {
  const p = r.probe;
  if (p.lane !== "tier-2") {
    return <span className="text-zinc-500">Parquet (Tier-1)</span>;
  }
  if (p.queryFailed) {
    return <span className="text-red-600">query failed</span>;
  }
  if (p.rowCount === 0) {
    return <span className="text-red-600">0 rows</span>;
  }
  const range =
    p.minYear !== null && p.maxYear !== null
      ? `${p.minYear}–${p.maxYear}`
      : "no date range";
  return (
    <span>
      {range}{" "}
      <span className="text-zinc-400">
        ({(p.rowCount ?? 0).toLocaleString("en-US")} rows)
      </span>
    </span>
  );
}

function freshnessCell(r: ClassifiedRow) {
  const p = r.probe;
  if (!p.lastLoad) {
    return <span className="text-zinc-400">never loaded</span>;
  }
  const date = p.lastLoad.slice(0, 10);
  const stale = r.freshness === "STALE";
  return (
    <span className={stale ? "text-amber-600" : "text-zinc-600"}>
      {date} <span className="text-zinc-400">({p.ageDays}d ago)</span>
    </span>
  );
}

function missingCell(r: ClassifiedRow) {
  if (r.probe.lane !== "tier-2") {
    return <span className="text-zinc-300">&mdash;</span>;
  }
  if (r.missing.length === 0) {
    return <span className="text-zinc-300">&mdash;</span>;
  }
  const recent = new Set(r.recentMissing);
  return (
    <span className="text-amber-600">
      {formatSpans(r.missing)}
      {r.recentMissing.length > 0 && (
        <span className="ml-1 text-red-600">
          (recent: {formatSpans([...recent])})
        </span>
      )}
    </span>
  );
}

const STATUS_STYLE: Record<HealthStatus, string> = {
  FRESH: "bg-emerald-50 text-emerald-700 border-emerald-200",
  STALE: "bg-amber-50 text-amber-700 border-amber-200",
  LOW_VOLUME: "bg-amber-50 text-amber-700 border-amber-200",
  RECENT_GAP: "bg-amber-50 text-amber-700 border-amber-200",
  EMPTY: "bg-red-50 text-red-700 border-red-200",
  MISSING: "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: HealthStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

function OrphanFootnote({ untrackedCount }: { untrackedCount: number }) {
  return (
    <footer className="mt-12 border-t border-zinc-200 pt-6 text-xs leading-5 text-zinc-500">
      <p>
        Three tier-1 feeds (<code>fred_g17</code>, <code>bls_ppi</code>,{" "}
        <code>census_vip</code>) are ingested but not yet consumed by any brain.
        Three tables hold rows with no live pipeline and are intentionally
        excluded from the probe (<code>dbhydro_stations</code>,{" "}
        <code>usgs_sites</code>, <code>fdot_freight_nowcast_shock_log</code>),
        as is the dead <code>marketbeat_swfl</code> scrape.
        {untrackedCount > 0 && (
          <>
            {" "}
            <span className="text-red-600">
              {untrackedCount} active pipeline(s) have no coverage entry — the
              drift test should have caught this.
            </span>
          </>
        )}
      </p>
      <p className="mt-2">
        Source of truth: <code>ingest/cadence_registry.yaml</code>. Coverage and
        freshness served via a server-only service-role client; no credentials
        reach the browser.
      </p>
    </footer>
  );
}

function CredsPanel({ message }: { message: string }) {
  return (
    <div className="min-h-dvh bg-white font-sans text-zinc-900">
      <main className="mx-auto max-w-4xl px-6 py-12 sm:px-8 sm:py-16">
        <header className="border-b border-zinc-200 pb-6">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Data lake coverage
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Coverage unavailable
          </h1>
        </header>
        <section className="mt-8">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            {message}
          </div>
        </section>
      </main>
    </div>
  );
}
