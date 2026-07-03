"use client";
// components/email/SendCeilingMeter.tsx
//
// Send-ceiling meter (Lane E conversion furniture). Self-fetching from
// GET /api/email/usage on mount; FAIL-QUIET: loading, error, and 401 all
// render nothing — this must never break a send surface or the rail.
//
//   variant="rail"  — compact line + hairline bar, pinned at the bottom of
//                     ProjectsRail (desktop project nav).
//   variant="panel" — the billing-page meter-card look (app/billing/page.tsx),
//                     mounted at send moments (ScheduleSendModal,
//                     ContactPickerModal).
//
// Bar color: teal < 80%, amber ≥ 80%, red at 100%. "Upgrade" → /billing
// appears from 80%.
import Link from "next/link";
import { useEffect, useState } from "react";

interface Usage {
  allowed: boolean;
  tier: string;
  sent: number;
  limit: number;
}

export function SendCeilingMeter({ variant }: { variant: "rail" | "panel" }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/usage")
      .then((r) => (r.ok ? (r.json() as Promise<Usage>) : null))
      .then((u) => {
        if (cancelled || !u) return;
        if (typeof u.sent === "number" && typeof u.limit === "number" && u.limit > 0) {
          setUsage(u);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage) return null;

  const pct = Math.min(100, Math.round((usage.sent / usage.limit) * 100));
  const barColor = pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-gulf-teal";

  if (variant === "rail") {
    return (
      <div className="mt-auto border-t border-white/10 px-1 pt-3">
        <p className="text-[10px] text-gray-500">
          {usage.sent} of {usage.limit} sends this month ·{" "}
          <span className="capitalize">{usage.tier}</span>
        </p>
        <div className="mt-1.5 h-[1.5px] w-full overflow-hidden rounded bg-white/10">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        {pct >= 80 && (
          <Link
            href="/billing"
            className="mt-1.5 inline-block text-[10px] font-semibold text-gulf-teal hover:underline"
          >
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-white/80">
          Plan: <span className="capitalize text-gulf-teal">{usage.tier}</span>
        </p>
        <p className="text-xs text-white/50">
          {usage.sent.toLocaleString()} / {usage.limit.toLocaleString()} sends
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 100 ? (
        <p className="mt-2 text-[11px] text-red-300">
          You&rsquo;ve reached this month&rsquo;s send limit.{" "}
          <Link href="/billing" className="font-semibold text-gulf-teal hover:underline">
            Upgrade
          </Link>
        </p>
      ) : pct >= 80 ? (
        <p className="mt-2 text-[11px] text-amber-300">
          Almost at your monthly limit.{" "}
          <Link href="/billing" className="font-semibold text-gulf-teal hover:underline">
            Upgrade
          </Link>
        </p>
      ) : null}
    </div>
  );
}
