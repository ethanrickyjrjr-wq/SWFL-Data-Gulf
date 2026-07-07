"use client";

import { useState } from "react";

export interface WatchConfig {
  watch_enabled: boolean;
  watch_mode: string | null;
  watch_radius_miles: number;
  watch_price_cut_threshold_pct: number;
  watch_beds: number | null;
  watch_baths: number | null;
  watch_sqft: number | null;
  watch_price: number | null;
  watch_price_is_estimate: boolean;
  has_location: boolean;
}

export interface WatchFeedEvent {
  id: string;
  event_type: string;
  event_date: string;
  distance_miles: number | null;
  ai_summary: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  nearby_new_listing: "New listing",
  nearby_price_cut: "Price cut",
  nearby_sale: "Sale",
};

function mmddyyyy(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

export function WatchClient({
  projectId,
  subjectAddress,
  initialConfig,
  initialEvents,
}: {
  projectId: string;
  subjectAddress: string | null;
  initialConfig: WatchConfig;
  initialEvents: WatchFeedEvent[];
}) {
  const [config, setConfig] = useState<WatchConfig>(initialConfig);
  const [events] = useState<WatchFeedEvent[]>(initialEvents);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Setup-form fields (only used when the tracked address isn't itself a listing).
  const [mode, setMode] = useState<"selling" | "watching">(
    initialConfig.watch_mode === "selling" ? "selling" : "watching",
  );
  const [radius, setRadius] = useState(String(initialConfig.watch_radius_miles ?? 0.5));
  const [threshold, setThreshold] = useState(
    String(initialConfig.watch_price_cut_threshold_pct ?? 2),
  );
  const [beds, setBeds] = useState(initialConfig.watch_beds?.toString() ?? "");
  const [baths, setBaths] = useState(initialConfig.watch_baths?.toString() ?? "");
  const [sqft, setSqft] = useState(initialConfig.watch_sqft?.toString() ?? "");
  const [price, setPrice] = useState(initialConfig.watch_price?.toString() ?? "");

  async function enable() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/watch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          radius_miles: Number(radius),
          price_cut_threshold_pct: Number(threshold),
          beds: beds ? Number(beds) : null,
          baths: baths ? Number(baths) : null,
          sqft: sqft ? Number(sqft) : null,
          price: price ? Number(price) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "could not start watching");
      setConfig({ ...json.config, has_location: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/watch`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "update failed");
      setConfig((c) => ({ ...c, ...json.config }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const label = "text-xs font-medium text-white/60";
  const input =
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gulf-teal/60 focus:outline-none";

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-white">Property Watch</h1>
        <p className="mt-1 text-sm text-white/60">
          New listings, price cuts, and sales near{" "}
          {subjectAddress ? (
            <span className="text-white/80">{subjectAddress}</span>
          ) : (
            "your tracked address"
          )}
          . We send updates on movement — the numbers, not opinions.
        </p>
      </header>

      {err && (
        <div className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {err}
        </div>
      )}

      {!config.watch_enabled ? (
        <SetupCard
          mode={mode}
          setMode={setMode}
          radius={radius}
          setRadius={setRadius}
          threshold={threshold}
          setThreshold={setThreshold}
          beds={beds}
          setBeds={setBeds}
          baths={baths}
          setBaths={setBaths}
          sqft={sqft}
          setSqft={setSqft}
          price={price}
          setPrice={setPrice}
          busy={busy}
          onEnable={enable}
          label={label}
          input={input}
        />
      ) : (
        <SummaryCard
          config={config}
          busy={busy}
          onDisable={() => patch({ watch_enabled: false })}
        />
      )}

      <section className="mt-7">
        <h2 className="mb-3 text-sm font-semibold text-white/80">Nearby movement</h2>
        {events.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/50">
            No nearby movement yet. As new listings, price cuts, and sales land within your radius,
            they’ll appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-gulf-teal/15 px-2 py-0.5 text-[11px] font-semibold text-gulf-teal">
                    {TYPE_LABEL[e.event_type] ?? e.event_type}
                  </span>
                  {e.event_date && (
                    <span className="text-[11px] text-white/40">{mmddyyyy(e.event_date)}</span>
                  )}
                </div>
                <p className="text-sm text-white/85">{e.ai_summary ?? ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SetupCard(props: {
  mode: "selling" | "watching";
  setMode: (m: "selling" | "watching") => void;
  radius: string;
  setRadius: (v: string) => void;
  threshold: string;
  setThreshold: (v: string) => void;
  beds: string;
  setBeds: (v: string) => void;
  baths: string;
  setBaths: (v: string) => void;
  sqft: string;
  setSqft: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  busy: boolean;
  onEnable: () => void;
  label: string;
  input: string;
}) {
  const { label, input } = props;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex gap-1.5 rounded-full bg-white/5 p-1">
        {(["watching", "selling"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => props.setMode(m)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              props.mode === m ? "bg-gulf-teal text-[#04121b]" : "text-white/60 hover:text-white"
            }`}
          >
            {m === "watching" ? "Just watching" : "Selling"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Radius (miles)</label>
          <input
            className={input}
            type="number"
            step="0.1"
            min="0.1"
            value={props.radius}
            onChange={(e) => props.setRadius(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Price-cut alert at (%)</label>
          <input
            className={input}
            type="number"
            step="0.5"
            min="0"
            value={props.threshold}
            onChange={(e) => props.setThreshold(e.target.value)}
          />
        </div>
      </div>

      <p className="mt-4 mb-2 text-xs text-white/50">
        Your property’s details (used to compare against nearby comps). If your address is an active
        listing, we fill these from the lake automatically — otherwise enter what you know.
      </p>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={label}>Beds</label>
          <input
            className={input}
            type="number"
            value={props.beds}
            onChange={(e) => props.setBeds(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Baths</label>
          <input
            className={input}
            type="number"
            value={props.baths}
            onChange={(e) => props.setBaths(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Sqft</label>
          <input
            className={input}
            type="number"
            value={props.sqft}
            onChange={(e) => props.setSqft(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Price</label>
          <input
            className={input}
            type="number"
            value={props.price}
            onChange={(e) => props.setPrice(e.target.value)}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={props.busy}
        onClick={props.onEnable}
        className="mt-5 w-full rounded-lg bg-gulf-teal px-4 py-2.5 text-sm font-semibold text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {props.busy ? "Starting…" : "Start watching"}
      </button>
    </div>
  );
}

function SummaryCard({
  config,
  busy,
  onDisable,
}: {
  config: WatchConfig;
  busy: boolean;
  onDisable: () => void;
}) {
  const spec = [
    config.watch_beds != null ? `${config.watch_beds} bd` : null,
    config.watch_baths != null ? `${config.watch_baths} ba` : null,
    config.watch_sqft != null ? `${config.watch_sqft.toLocaleString("en-US")} sqft` : null,
    config.watch_price != null ? `$${config.watch_price.toLocaleString("en-US")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-xl border border-gulf-teal/25 bg-gulf-teal/[0.06] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            Watching within {config.watch_radius_miles} mi
            <span className="ml-2 text-xs font-normal text-white/50">
              ({config.watch_mode === "selling" ? "selling" : "just watching"})
            </span>
          </p>
          <p className="mt-1 text-xs text-white/60">
            Price-cut alerts at {config.watch_price_cut_threshold_pct}%+
          </p>
          {spec && (
            <p className="mt-2 text-xs text-white/70">
              Your property: {spec}
              {config.watch_price_is_estimate && config.watch_price != null && (
                <span className="text-white/40"> (estimate)</span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDisable}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          {busy ? "…" : "Turn off"}
        </button>
      </div>
    </div>
  );
}
