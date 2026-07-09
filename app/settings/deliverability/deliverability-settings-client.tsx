"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { DeliverabilityStatusResponse } from "@/app/api/email/deliverability-status/route";

type Color = "red" | "yellow" | "green";

const DOT: Record<Color, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-red-400",
};

const TEXT: Record<Color, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-red-400",
};

interface DnsRecord {
  record?: string;
  type?: string;
  name?: string;
  value?: string;
  status?: string;
}

function StatusLine(props: {
  color: Color | "unknown";
  label: string;
  detail: string;
  fix?: ReactNode;
}) {
  const { color, label, detail, fix } = props;
  return (
    <div className="flex items-start gap-3 border-b border-white/5 py-3 last:border-0">
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
          color === "unknown" ? "bg-gray-600" : DOT[color]
        }`}
      />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${color === "unknown" ? "text-gray-400" : TEXT[color]}`}>
          {label}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{detail}</p>
        {fix && <p className="mt-1 text-xs text-gray-500">{fix}</p>}
      </div>
    </div>
  );
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Deliverability diagnostic panel — surfaces the already-built domain-verify
 * backend (SPF/DKIM via Resend, app/api/email/domain-verify/route.ts, never
 * shown before this page) plus DMARC (a genuine gap Resend doesn't track) and
 * bounce/complaint rate against Google's published bulk-sender thresholds.
 * Design: docs/superpowers/specs/2026-07-08-deliverability-diagnostic-panel-design.md.
 */
export function DeliverabilitySettingsClient() {
  const [status, setStatus] = useState<DeliverabilityStatusResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Registration form state (only used pre-registration).
  const [domain, setDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");

  const load = useCallback(async (): Promise<
    DeliverabilityStatusResponse | "unauthorized" | null
  > => {
    try {
      const res = await fetch("/api/email/deliverability-status");
      if (res.ok) return (await res.json()) as DeliverabilityStatusResponse;
      if (res.status === 401) return "unauthorized";
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    load().then((r) => {
      if (r === "unauthorized") setError("Sign in to view your deliverability status.");
      else if (r) setStatus(r);
      else setError("Could not load deliverability status. Try again.");
      setLoaded(true);
    });
  }, [load]);

  async function refresh() {
    setBusy(true);
    setError(null);
    const r = await load();
    if (r === "unauthorized") setError("Sign in to view your deliverability status.");
    else if (r) setStatus(r);
    else setError("Could not load deliverability status. Try again.");
    setBusy(false);
  }

  async function register() {
    if (!domain.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/email/domain-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          from_name: fromName.trim() || undefined,
          from_email: fromEmail.trim() || undefined,
          reply_to: replyTo.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "Could not register the domain. Try again.");
        return;
      }
      await refresh();
    } catch {
      setError("Could not register the domain. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function recheckVerification() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/email/domain-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "poll" }),
      });
      if (!res.ok) {
        setError("Could not recheck verification. Try again.");
        return;
      }
      await refresh();
    } catch {
      setError("Could not recheck verification. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const dnsRecords = Array.isArray(status?.dnsRecords) ? (status.dnsRecords as DnsRecord[]) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Deliverability</h1>
        <p className="mt-1 text-sm text-gray-400">
          Whether your sending domain will actually land in the inbox — SPF, DKIM, DMARC, and your
          bounce/complaint rate against{" "}
          <span className="text-gray-300">Gmail&apos;s published bulk-sender guidelines</span>.
        </p>
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !status?.domainRegistered ? (
        <div className="space-y-3 rounded-lg border border-white/10 p-4">
          <p className="text-sm text-gray-300">
            No sending domain registered yet. Add one to send under your own name instead of the
            platform default.
          </p>
          <input
            type="text"
            placeholder="yourdomain.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#04121b] px-3 py-2 text-sm text-gray-200"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="text"
              placeholder="From name (optional)"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="rounded-md border border-white/10 bg-[#04121b] px-3 py-2 text-xs text-gray-200"
            />
            <input
              type="email"
              placeholder="From email (optional)"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              className="rounded-md border border-white/10 bg-[#04121b] px-3 py-2 text-xs text-gray-200"
            />
            <input
              type="email"
              placeholder="Reply-to (optional)"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              className="rounded-md border border-white/10 bg-[#04121b] px-3 py-2 text-xs text-gray-200"
            />
          </div>
          <button
            type="button"
            disabled={busy || !domain.trim()}
            onClick={register}
            className="rounded-full bg-gulf-teal px-4 py-1.5 text-xs font-medium text-[#04121b] disabled:opacity-40"
          >
            {busy ? "Registering…" : "Register domain"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-300">
              {status.domain}{" "}
              <span className={status.domainVerified ? "text-emerald-400" : "text-amber-400"}>
                {status.domainVerified ? "verified" : "pending verification"}
              </span>
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={recheckVerification}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
            >
              Recheck
            </button>
          </div>

          <div className="rounded-lg border border-white/10 px-4">
            {dnsRecords.length === 0 ? (
              <StatusLine
                color="unknown"
                label="SPF / DKIM"
                detail="No DNS records returned yet — try Recheck."
              />
            ) : (
              dnsRecords.map((r, i) => (
                <StatusLine
                  key={`${r.record ?? r.type ?? "record"}-${i}`}
                  color={
                    r.status === "verified" ? "green" : r.status === "pending" ? "yellow" : "red"
                  }
                  label={`${r.record ?? r.type ?? "DNS record"} — ${r.status ?? "unknown"}`}
                  detail={
                    r.name
                      ? `${r.name} (${r.type ?? "TXT"})`
                      : "Add this record at your DNS provider."
                  }
                />
              ))
            )}

            {status.dmarc === null ? null : status.dmarc.status === "error" ? (
              <StatusLine
                color="unknown"
                label="DMARC"
                detail="Couldn't check right now — try Recheck in a minute."
              />
            ) : status.dmarc.status === "not_set" ? (
              <StatusLine
                color="red"
                label="DMARC — not set up"
                detail="Gmail requires DMARC for bulk senders (5,000+/day)."
                fix={`Add a TXT record at _dmarc.${status.domain} — e.g. v=DMARC1; p=quarantine; rua=mailto:you@${status.domain}`}
              />
            ) : (
              <StatusLine
                color={status.dmarc.color}
                label={`DMARC — p=${status.dmarc.policy ?? "unknown"}`}
                detail={
                  status.dmarc.policy === "none"
                    ? "Set up but not enforcing yet (p=none)."
                    : "Enforcing — this is the state Gmail wants for bulk senders."
                }
              />
            )}

            {!status.bounce.known ? (
              <StatusLine
                color="unknown"
                label="Bounce rate"
                detail="Not enough send history yet."
              />
            ) : (
              <StatusLine
                color={status.bounce.color}
                label={`Bounce rate — ${formatRate(status.bounce.rate)}`}
                detail={
                  status.bounce.color === "red"
                    ? "Above 2% is a sender-reputation hygiene problem — clean your list."
                    : `Last ${status.windowDelivered} delivered sends, 30-day window.`
                }
              />
            )}

            {!status.spam.known ? (
              <StatusLine color="unknown" label="Spam rate" detail="Not enough send history yet." />
            ) : (
              <StatusLine
                color={status.spam.color}
                label={`Spam complaint rate — ${formatRate(status.spam.rate)}`}
                detail="Per Gmail's guidelines: stay under 0.10%, never reach 0.30%."
              />
            )}

            <StatusLine
              color="green"
              label="One-click unsubscribe"
              detail="List-Unsubscribe + List-Unsubscribe-Post headers ship on every send."
            />

            <StatusLine
              color={status.canSpamAddressPresent ? "green" : "red"}
              label="CAN-SPAM postal address"
              detail={
                status.canSpamAddressPresent
                  ? "A business address is set on your brand profile."
                  : "Required on every commercial email — none set yet."
              }
              fix={
                status.canSpamAddressPresent ? undefined : (
                  <>
                    Add one in{" "}
                    <Link href="/account/brand" className="text-gulf-teal">
                      your brand profile
                    </Link>
                    .
                  </>
                )
              }
            />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
