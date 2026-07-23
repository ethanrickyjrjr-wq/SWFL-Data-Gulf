"use client";

import { useState } from "react";

/**
 * Weekly-read capture (Lane B spec §6 / spine D3). NOT currently mounted —
 * confirmed unimported anywhere under app/ (pinned by
 * lib/landing/home-spine.static.test.ts, which asserts app/page.tsx contains
 * neither "WeeklyReadCapture" nor "Waitlist"). The live weekly-read signup UI
 * that actually ships today is components/email/SubscribeCapture.tsx, mounted
 * at app/r/zip-report/[zip]/page.tsx with endpoint="/api/weekly-read/subscribe"
 * (same endpoint below). Mounting this component (vs. deleting it) is an
 * open operator judgment call — left in place on purpose, not an oversight.
 *
 * Posts to the LIVE Lane D enrollment endpoint (POST
 * /api/weekly-read/subscribe — public.weekly_read_subscribers, consent
 * recorded server-side, out-of-footprint ZIPs hard-400). The old fork-2
 * `weekly_read_signups` seam is obsolete — Lane D landed first.
 */
export default function WeeklyReadCapture() {
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "bad_zip" | "error">(
    "idle",
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^\d{5}$/.test(zip.trim())) {
      setStatus("bad_zip");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/weekly-read/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, zip: zip.trim(), source: "homepage" }),
      });
      if (res.ok) {
        setStatus("done");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus(body?.error === "invalid_zip" ? "bad_zip" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <section className="weekly-capture" id="weekly-read">
        <div className="weekly-inner">
          <h2 className="weekly-headline">You&rsquo;re in.</h2>
          <p className="weekly-sub">
            The weekly read for {zip.trim()} starts with the next issue. Unsubscribe anytime, from
            any email.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="weekly-capture" id="weekly-read">
      <div className="weekly-inner">
        <h2 className="weekly-headline">Get the weekly market read for your ZIP</h2>
        <p className="weekly-sub">
          Built from the same live data above, sent by the same engine. One email a week, every
          number cited. Unsubscribe anytime.
        </p>
        <form className="weekly-form" onSubmit={submit}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="weekly-input weekly-input-email"
            disabled={status === "submitting"}
          />
          <input
            type="text"
            required
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
            placeholder="ZIP"
            aria-label="ZIP code"
            className="weekly-input weekly-input-zip"
            disabled={status === "submitting"}
          />
          <button type="submit" className="weekly-btn" disabled={status === "submitting"}>
            {status === "submitting" ? "Signing up…" : "Get the weekly read"}
          </button>
        </form>
        {status === "bad_zip" && (
          <p className="weekly-msg">
            Weekly reads cover Southwest Florida ZIPs — check the 5 digits and try again.
          </p>
        )}
        {status === "error" && (
          <p className="weekly-msg">Something went wrong. Try again in a moment.</p>
        )}
        <p className="weekly-fine">No spam, ever. Your email stays on our infrastructure only.</p>
      </div>
    </section>
  );
}
