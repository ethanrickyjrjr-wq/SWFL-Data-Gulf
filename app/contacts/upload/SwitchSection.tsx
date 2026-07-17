"use client";

import { useState } from "react";

/**
 * "Switching from another platform?" — the migration surface on /contacts/upload
 * (Task 12). Four ways in, plus the pending-forwards inbox and the Switch Pass
 * banner:
 *
 *   1. Mailchimp — a one-tap OAuth redirect to /api/email/contacts/mailchimp/start.
 *   2. Follow Up Boss — paste an API key, POST /api/email/contacts/fub.
 *   3. Forward to switch@ — email a campaign or contact export; it lands as a
 *      PENDING forward (owner-read RLS) the agent applies from here.
 *   4. (Google + CSV already live above, in UploadForm — never duplicated here.)
 *
 * Pending forwards carry Apply / Dismiss buttons (POST /api/switch/apply-forward).
 * Applying a CAMPAIGN forward also triggers the wow rebuild (a fresh draft +
 * an edit-link email); applying a CONTACT EXPORT imports the contacts and
 * activates the Switch Pass.
 *
 * ONE-ROOM: this is a document-style PageShell page, so it lifts UploadForm's
 * exact card vocabulary verbatim — `rounded-xl border border-white/10
 * bg-[#0d1e2b]/50 p-4` cards, gulf-teal buttons, gray-500 subtext. It invents
 * no chrome and duplicates no action already on the page.
 */

interface PendingForward {
  id: string;
  kind: "campaign" | "contact_export";
  platform: string | null;
  senderDomain: string | null;
  contactCount: number | null;
}

interface ActivePass {
  tier: string;
  expiresLabel: string | null;
}

interface FubResult {
  imported: number;
  skipped: number;
  pass: boolean;
  partial?: boolean;
  truncated?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  mailchimp: "Mailchimp",
  constantcontact: "Constant Contact",
  followupboss: "Follow Up Boss",
};

const MAILCHIMP_ERRORS: Record<string, string> = {
  not_configured: "Mailchimp import isn’t switched on yet — forward your export to us instead.",
};

function platformLabel(platform: string | null): string {
  if (!platform) return "another platform";
  return PLATFORM_LABELS[platform] ?? platform;
}

function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function sourceLabel(f: PendingForward): string {
  const where = f.platform ? platformLabel(f.platform) : (f.senderDomain ?? "another platform");
  if (f.kind === "contact_export") {
    const n = f.contactCount;
    return n != null
      ? `${n} contact${n === 1 ? "" : "s"} from ${where}`
      : `Contact export from ${where}`;
  }
  return `Campaign from ${where}`;
}

export function SwitchSection({
  switchAddress,
  mailchimpError,
  activePass,
  pendingForwards,
}: {
  switchAddress: string;
  mailchimpError: string | null;
  activePass: ActivePass | null;
  pendingForwards: PendingForward[];
}) {
  const [forwards, setForwards] = useState<PendingForward[]>(pendingForwards);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [fubKey, setFubKey] = useState("");
  const [fubBusy, setFubBusy] = useState(false);
  const [fubError, setFubError] = useState<string | null>(null);
  const [fubResult, setFubResult] = useState<FubResult | null>(null);

  async function applyForward(f: PendingForward, dismiss: boolean) {
    setBusyId(f.id);
    setRowError((m) => ({ ...m, [f.id]: "" }));
    try {
      const res = await fetch("/api/switch/apply-forward", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dismiss ? { forwardId: f.id, dismiss: true } : { forwardId: f.id }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        imported?: number;
        skipped?: number;
        pass?: boolean;
        partial?: boolean;
        rebuildQueued?: boolean;
      };
      if (!res.ok) {
        setRowError((m) => ({
          ...m,
          [f.id]: "We couldn’t finish that just now — please try again.",
        }));
        return;
      }
      // Success: drop the row and show a plain, honest result line.
      setForwards((rows) => rows.filter((r) => r.id !== f.id));
      if (dismiss) {
        setNotice("Dismissed.");
      } else if (f.kind === "contact_export") {
        const imported = json.imported ?? 0;
        const skipped = json.skipped ?? 0;
        setNotice(
          `Imported ${imported} contact${imported === 1 ? "" : "s"}` +
            (skipped ? `, skipped ${skipped}` : "") +
            "." +
            (json.partial ? " Some didn’t save — we imported what we could." : "") +
            (json.pass ? " Switch Pass active." : ""),
        );
      } else {
        setNotice(
          json.rebuildQueued
            ? "Applied — we’re rebuilding it with today’s data. Check your inbox for the edit link."
            : "Applied.",
        );
      }
    } catch {
      setRowError((m) => ({
        ...m,
        [f.id]: "We couldn’t finish that just now — please try again.",
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function importFub() {
    const key = fubKey.trim();
    if (!key) {
      setFubError("Paste your Follow Up Boss API key first.");
      return;
    }
    setFubBusy(true);
    setFubError(null);
    setFubResult(null);
    try {
      const res = await fetch("/api/email/contacts/fub", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const json = (await res.json().catch(() => ({}))) as FubResult & { error?: string };
      if (!res.ok) {
        setFubError(
          json.error === "fub_fetch_failed"
            ? "Couldn’t reach Follow Up Boss — check the key and try again."
            : "Import didn’t complete — please try again.",
        );
        return;
      }
      setFubResult(json);
      setFubKey("");
    } catch {
      setFubError("Import didn’t complete — please try again.");
    } finally {
      setFubBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Switching from another platform?</h2>
        <p className="mt-1 text-sm text-gray-400">
          Bring your list — and your last campaign — over in a couple of clicks. Your contacts stay
          yours; we never email them without you.
        </p>
      </div>

      {/* Active Switch Pass banner — reads the user's own switch_passes row. */}
      {activePass && (
        <div className="rounded-xl border border-gulf-teal/30 bg-gulf-teal/10 p-4">
          <p className="text-sm text-gulf-teal">
            ✓ Switch Pass active — {titleCase(activePass.tier)} free
            {activePass.expiresLabel ? ` until ${activePass.expiresLabel}` : ""}.
          </p>
        </div>
      )}

      {/* Pending forwards — apply or dismiss what you emailed to switch@. */}
      {forwards.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4">
          <h3 className="text-sm font-semibold text-white">Waiting for you to apply</h3>
          <p className="mt-1 text-xs text-gray-500">
            You forwarded these to us. Applying is what pulls them onto your account.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {forwards.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0d1e2b] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{sourceLabel(f)}</p>
                  {rowError[f.id] && <p className="text-xs text-red-400">{rowError[f.id]}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === f.id}
                    onClick={() => void applyForward(f, false)}
                    className="rounded-full bg-gulf-teal px-4 py-1.5 text-sm font-semibold text-[#04121b] disabled:opacity-40"
                  >
                    {busyId === f.id ? "Applying…" : "Apply"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === f.id}
                    onClick={() => void applyForward(f, true)}
                    className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-40"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice && <p className="text-sm text-gulf-teal">{notice}</p>}

      {/* Mailchimp — one-tap OAuth import. */}
      <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4">
        <h3 className="text-sm font-semibold text-white">Import from Mailchimp</h3>
        <p className="mt-1 text-xs text-gray-500">
          Sign in to Mailchimp once and we’ll pull your audience straight in.
        </p>
        <a
          href="/api/email/contacts/mailchimp/start"
          className="mt-3 inline-block rounded-full bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#04121b]"
        >
          Import from Mailchimp
        </a>
        {mailchimpError && (
          <p className="mt-2 text-xs text-red-400">
            {MAILCHIMP_ERRORS[mailchimpError] ??
              "Mailchimp import didn’t complete — please try again."}
          </p>
        )}
      </div>

      {/* Follow Up Boss — paste an API key. */}
      <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4">
        <h3 className="text-sm font-semibold text-white">Import from Follow Up Boss</h3>
        <p className="mt-1 text-xs text-gray-500">
          Paste your Follow Up Boss API key. We use it once to read your people and never store it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={fubKey}
            onChange={(e) => setFubKey(e.target.value)}
            placeholder="Follow Up Boss API key"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d1e2b] px-3 py-2 text-sm text-white outline-none focus:border-gulf-teal/40"
          />
          <button
            type="button"
            disabled={fubBusy}
            onClick={() => void importFub()}
            className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#04121b] disabled:opacity-40"
          >
            {fubBusy ? "Importing…" : "Import"}
          </button>
        </div>
        {fubError && <p className="mt-2 text-xs text-red-400">{fubError}</p>}
        {fubResult && (
          <p className="mt-2 text-xs text-gray-400">
            {fubResult.imported > 0
              ? `Imported ${fubResult.imported} contact${fubResult.imported === 1 ? "" : "s"}` +
                (fubResult.skipped ? `, skipped ${fubResult.skipped}` : "") +
                "."
              : "We didn’t find any new contacts to import."}
            {fubResult.partial ? " Some didn’t save — we imported what we could." : ""}
            {fubResult.truncated
              ? " We stopped at the import cap — reach out to bring the rest."
              : ""}
            {fubResult.pass ? " Switch Pass active." : ""}
          </p>
        )}
      </div>

      {/* Forward to switch@ — the email lane, with honest 2-click export steps. */}
      <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4">
        <h3 className="text-sm font-semibold text-white">Or forward it to us</h3>
        <p className="mt-1 text-xs text-gray-500">
          Email your contact export — or your last campaign — to{" "}
          <span className="font-mono text-gulf-teal">{switchAddress}</span> from the address you
          signed up with. It’ll show up above to apply. Forward a campaign and we’ll rebuild it with
          today’s live data as a draft you can edit before it goes anywhere.
        </p>
        <div className="mt-3 text-xs text-gray-400">
          <p className="font-semibold text-gray-300">Where to export from:</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Mailchimp: Audience → Export Audience</li>
            <li>Constant Contact: Contacts → Export</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
