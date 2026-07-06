"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScheduleSendModal } from "@/components/email-lab/ScheduleSendModal";
import { ScheduleSocialModal } from "@/components/email-lab/ScheduleSocialModal";
import { openDoc } from "@/lib/lab-entry/destination";
import type { SocialDraft } from "@/lib/email/social-calendar/types";
import type { EmailDoc } from "@/lib/email/doc/types";
import {
  DAY_OF_WEEK,
  type QueueItemState,
  type ThisWeekSocial,
  type ThisWeekState,
} from "@/lib/project/this-week";
import type { DeliverableRow } from "./types";

const DAY_LABEL: Record<ThisWeekSocial["day"], string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

interface Props {
  projectId: string;
  week: ThisWeekState | null;
  /** Live material heads — resolves a queue item's did → its EmailDoc. */
  deliverables: DeliverableRow[];
  scopeKind: string | null;
  scopeValue: string | null;
  /** Persists the whole bag key (ProjectWorkspace.patchUiState). */
  onWeekChange: (next: ThisWeekState) => Promise<boolean>;
}

// Cockpit D0 — the ready-for-you queue. Opening a project never lands on an
// empty desk: this week's email + posts are already generated; each card offers
// Approve & schedule · Tweak · Skip; Schedule all closes the week. Generation
// failure degrades to the existing Overview below (never a blank screen, never
// a blocking spinner) with a retry chip.
export function ThisWeek({
  projectId,
  week: initialWeek,
  deliverables,
  scopeKind,
  scopeValue,
  onWeekChange,
}: Props) {
  const router = useRouter();
  const [week, setWeek] = useState<ThisWeekState | null>(initialWeek);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(false);
  const [emailScheduleFor, setEmailScheduleFor] = useState<string | null>(null);
  const [socialScheduleFor, setSocialScheduleFor] = useState<ThisWeekSocial | null>(null);
  const [scheduleAllBusy, setScheduleAllBusy] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  const firedRef = useRef(false); // strict-mode / remount double-fire guard

  // ONE generation entry point, used by mount and retry. The SERVER owns
  // week_of currency (once-per-week guard + partial-side retry live in the
  // route), so the client always POSTs; a current, complete week comes back
  // {cached:true} instantly and nothing changes visually.
  function generate() {
    const hadContent = !!week && (week.email != null || week.social.length > 0);
    setGenError(false);
    if (!hadContent) setGenerating(true); // never a blocking spinner over an existing queue
    fetch(`/api/projects/${projectId}/week`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("week failed"))))
      .then((data: { week?: ThisWeekState; cached?: boolean }) => {
        if (data.week) {
          setWeek(data.week);
          setGenError(Boolean(data.week.errors?.email || data.week.errors?.social));
          // Materials were inserted server-side — refresh the RSC payload so
          // MaterialsHub + our did→doc lookups see them.
          if (!data.cached) router.refresh();
        } else {
          setGenError(true);
        }
      })
      .catch(() => setGenError(true))
      .finally(() => setGenerating(false));
  }

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function docByDid(did: string): EmailDoc | null {
    return deliverables.find((d) => d.id === did)?.doc ?? null;
  }

  async function persist(next: ThisWeekState) {
    setWeek(next);
    await onWeekChange(next);
  }

  function setEmailState(state: QueueItemState) {
    if (!week?.email) return;
    void persist({ ...week, email: { ...week.email, state } });
  }
  function setSocialState(did: string, state: QueueItemState) {
    if (!week) return;
    void persist({
      ...week,
      social: week.social.map((s) => (s.did === did ? { ...s, state } : s)),
    });
  }

  function draftFor(s: ThisWeekSocial): SocialDraft | null {
    const doc = docByDid(s.did);
    if (!doc) return null;
    return { day: s.day, theme: s.theme, caption: s.caption, hashtags: s.hashtags, card: doc };
  }

  // "Schedule all" — the week's closing action (the paywall moment lives here in
  // Phase 2; Phase 1 writes real schedule rows). Approved socials schedule with
  // defaults (all connected platforms, weekly on the post's day, 9am ET); the
  // email needs an audience — a genuine user choice — so it finishes in its modal.
  async function scheduleAll() {
    if (!week || scheduleAllBusy) return;
    setScheduleAllBusy(true);
    setScheduleMsg(null);
    try {
      const approvedSocial = week.social.filter((s) => s.state === "approved");
      const approvedCount = approvedSocial.length + (week.email?.state === "approved" ? 1 : 0);
      const skippedCount =
        week.social.filter((s) => s.state === "skipped").length +
        (week.email?.state === "skipped" ? 1 : 0);

      let scheduled = 0;
      let next = week;
      if (approvedSocial.length > 0) {
        const acctRes = await fetch("/api/social/schedule");
        const { accounts } = (acctRes.ok ? await acctRes.json() : { accounts: [] }) as {
          accounts?: { platform: string }[];
        };
        const platforms = [...new Set((accounts ?? []).map((a) => a.platform))];
        if (platforms.length === 0) {
          setScheduleMsg(
            "Connect a social account to schedule posts — the email can still go out.",
          );
        } else {
          for (const s of approvedSocial) {
            const post = draftFor(s);
            if (!post) continue;
            const r = await fetch("/api/social/schedule", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                projectId,
                post,
                platforms,
                cadence: "weekly",
                day_of_week: DAY_OF_WEEK[s.day],
                send_hour_et: 9,
              }),
            });
            if (r.ok) {
              scheduled++;
              next = {
                ...next,
                social: next.social.map((x) =>
                  x.did === s.did ? { ...x, state: "scheduled" as const } : x,
                ),
              };
            }
          }
          await persist(next);
          setScheduleMsg(
            `${scheduled} post${scheduled === 1 ? "" : "s"} queued — sending activates at launch.`,
          );
        }
      }

      // Verdict metric #1 — fire regardless of how many landed (counts tell the story).
      void fetch(`/api/projects/${projectId}/track`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "week_schedule_all",
          approved: approvedCount,
          skipped: skippedCount,
        }),
      });

      if (next.email?.state === "approved") setEmailScheduleFor(next.email.did);
    } finally {
      setScheduleAllBusy(false);
    }
  }

  const anyApproved =
    !!week && (week.email?.state === "approved" || week.social.some((s) => s.state === "approved"));

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">This Week</h2>
        {week && (
          <span className="text-[10px] text-white/35">
            Week of {week.week_of.slice(5, 7)}/{week.week_of.slice(8, 10)}/
            {week.week_of.slice(0, 4)}
          </span>
        )}
      </div>

      {generating && (
        <p className="mt-2 flex items-center gap-2 text-xs text-white/50">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-gulf-teal" />
          Preparing your week — email and posts build from fresh data…
        </p>
      )}

      {genError && !generating && (
        <button
          type="button"
          onClick={generate}
          className="mt-2 rounded-full border border-amber-400/40 px-3 py-1 text-xs text-amber-300 hover:bg-amber-400/10"
        >
          Some of this week didn&apos;t generate — retry
        </button>
      )}

      {week && (week.email || week.social.length > 0) && (
        <>
          <ul className="mt-3 space-y-2">
            {week.email && (
              <QueueCard
                badge="Email"
                title="This week's market email"
                excerpt=""
                state={week.email.state}
                onApprove={() => {
                  setEmailState("approved");
                  setEmailScheduleFor(week.email!.did);
                }}
                onTweak={() => router.push(openDoc(projectId, week.email!.did))}
                onSkip={() => setEmailState("skipped")}
              />
            )}
            {week.social.map((s) => (
              <QueueCard
                key={s.did}
                badge={DAY_LABEL[s.day]}
                title={s.theme}
                excerpt={s.caption}
                state={s.state}
                onApprove={() => {
                  setSocialState(s.did, "approved");
                  setSocialScheduleFor({ ...s, state: "approved" });
                }}
                onTweak={() => router.push(openDoc(projectId, s.did))}
                onSkip={() => setSocialState(s.did, "skipped")}
              />
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void scheduleAll()}
              disabled={!anyApproved || scheduleAllBusy}
              className="rounded-full bg-gulf-teal px-4 py-1.5 text-xs font-semibold text-[#04121b] hover:bg-[#17a3b3] disabled:opacity-40"
            >
              {scheduleAllBusy ? "Scheduling…" : "Schedule all approved"}
            </button>
            {scheduleMsg && <span className="text-[11px] text-white/50">{scheduleMsg}</span>}
          </div>
        </>
      )}

      {emailScheduleFor && (
        <ScheduleSendModal
          deliverableId={emailScheduleFor}
          projectId={projectId}
          scopeKind={scopeKind}
          scopeValue={scopeValue}
          onClose={() => setEmailScheduleFor(null)}
        />
      )}
      {socialScheduleFor && draftFor(socialScheduleFor) && (
        <ScheduleSocialModal
          draft={draftFor(socialScheduleFor)!}
          projectId={projectId}
          scopeKind={scopeKind}
          scopeValue={scopeValue}
          onClose={() => setSocialScheduleFor(null)}
        />
      )}
    </section>
  );
}

function QueueCard({
  badge,
  title,
  excerpt,
  state,
  onApprove,
  onTweak,
  onSkip,
}: {
  badge: string;
  title: string;
  excerpt: string;
  state: QueueItemState;
  onApprove: () => void;
  onTweak: () => void;
  onSkip: () => void;
}) {
  const done = state === "scheduled" || state === "skipped";
  return (
    <li
      className={`rounded-lg border border-white/10 p-3 ${done ? "opacity-50" : "bg-white/[0.03]"}`}
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-gulf-teal/15 px-1.5 py-0.5 text-[10px] font-semibold text-gulf-teal">
          {badge}
        </span>
        <span className="truncate text-xs font-medium text-white/85">{title}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-white/35">{state}</span>
      </div>
      {excerpt && <p className="mt-1 line-clamp-2 text-[11px] text-white/45">{excerpt}</p>}
      {!done && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="rounded-full bg-gulf-teal/90 px-2.5 py-1 text-[10px] font-semibold text-[#04121b] hover:bg-gulf-teal"
          >
            Approve &amp; schedule
          </button>
          <button
            type="button"
            onClick={onTweak}
            className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/60 hover:bg-white/5"
          >
            Tweak
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full px-2.5 py-1 text-[10px] text-white/35 hover:text-white/60"
          >
            Skip
          </button>
        </div>
      )}
    </li>
  );
}
