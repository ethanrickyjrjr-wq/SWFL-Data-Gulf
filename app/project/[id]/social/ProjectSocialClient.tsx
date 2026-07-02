"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SocialComposer } from "@/components/email-lab/social/SocialComposer";
import { SocialElementInspector } from "@/components/email-lab/social/SocialElementInspector";
import { useSocialComposer } from "@/components/email-lab/social/useSocialComposer";
import { SocialCalendarPanel } from "@/components/email-lab/SocialCalendarPanel";
import { ScheduleSocialModal } from "@/components/email-lab/ScheduleSocialModal";
import { PhotosPanel } from "@/components/email-lab/PhotosPanel";
import type { SocialElement } from "@/lib/social/design/types";
import { applyBrand } from "@/components/email-lab/EmailLabShell";
import { brandingToTokens } from "@/lib/email/brand/branding-to-tokens";
import { formatForClipboard } from "@/lib/email/social-calendar/week";
import type { CalendarDay, SocialDraft, WeeklyCalendar } from "@/lib/email/social-calendar/types";
import type { EmailDoc } from "@/lib/email/doc/types";

interface Props {
  projectId: string;
  projectTitle: string;
  branding: Record<string, string>;
  scope?: { kind: string; value: string };
  projectPhotos: { storage_path: string; signedUrl: string; caption?: string }[];
}

// Element palette for the "New post" section (mirrors the grid shell's private
// SOCIAL_PALETTE — chart is author-seeded, never palette-added).
const PALETTE: { type: SocialElement["type"]; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "stat", label: "Stat" },
  { type: "cta", label: "Button + link" },
  { type: "image", label: "Image" },
  { type: "logo", label: "Logo" },
];

// Cockpit D3 — the Social tool as a full page: the existing composer +
// Generate-Week calendar + schedule modal, PROMOTED out of the email shells.
// Surface move only: publish engine (lib/social/) and calendar system
// (lib/email/social-calendar/) remain two systems.
export function ProjectSocialClient({
  projectId,
  projectTitle,
  branding,
  scope,
  projectPhotos,
}: Props) {
  const router = useRouter();
  const social = useSocialComposer({ scope, projectId, branding });
  const tokens = brandingToTokens(branding);

  // Generate-Week state (exact generateWeek shape from EmailLabGridShell).
  const [calState, setCalState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [calendar, setCalendar] = useState<WeeklyCalendar | null>(null);
  const [expandedDay, setExpandedDay] = useState<CalendarDay | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<SocialDraft | null>(null);
  // Card-preview column: the day card rendered to email HTML with project brand.
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<EmailDoc | null>(null);
  const [savingCard, setSavingCard] = useState(false);

  async function generateWeek() {
    setCalState("loading");
    try {
      const res = await fetch("/api/email-lab/social-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = (await res.json()) as { calendar?: WeeklyCalendar };
      if (data.calendar?.posts?.length) {
        setCalendar(data.calendar);
        setCalState("ready");
      } else {
        setCalState("error");
      }
    } catch {
      setCalState("error");
    }
  }

  // "Load Card" — render the day's EmailDoc with the project brand into the
  // preview column (brand applied client-side, the established card path).
  async function loadCard(card: EmailDoc) {
    const branded = applyBrand(card, tokens);
    setPreviewCard(branded);
    setPreviewHtml(null);
    try {
      const res = await fetch("/api/email-lab/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: branded }),
      });
      setPreviewHtml(((await res.json()) as { html?: string }).html ?? "");
    } catch {
      setPreviewHtml("");
    }
  }

  // "Edit in Email" — save the branded card as a material, deep-link the Email tab.
  async function editInEmail() {
    if (!previewCard || savingCard) return;
    setSavingCard(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: previewCard }),
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        router.push(`/project/${projectId}/email-lab?did=${id}`);
      }
    } finally {
      setSavingCard(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:flex-row">
      {/* Left rail — header + Generate Week calendar + New post controls */}
      <aside className="w-full shrink-0 overflow-y-auto lg:w-72">
        <Link
          href={`/project/${projectId}`}
          className="mb-2 flex items-center gap-1.5 text-[10px] text-white/35 transition-colors hover:text-white/60"
        >
          ← {projectTitle}
        </Link>
        <p className="text-sm font-semibold text-white/80">Social</p>
        <p className="mt-0.5 text-[10px] text-gulf-teal">
          {scope
            ? `Scope: ${scope.kind === "zip" ? "ZIP " : ""}${scope.value}`
            : "Southwest Florida"}
          {" · real data enabled"}
        </p>
        <SocialCalendarPanel
          state={calState}
          calendar={calendar}
          expandedDay={expandedDay}
          onGenerate={generateWeek}
          onToggleDay={(d) => setExpandedDay((cur) => (cur === d ? null : d))}
          onCopyCaption={(d) => void navigator.clipboard.writeText(formatForClipboard(d))}
          onLoadCard={loadCard}
          onSchedule={setScheduleDraft}
        />

        {/* New post — the AI controls that drive the center canvas (the grid
            shell's right-aside social controls, promoted here). */}
        <div className="mt-4 border-t border-white/8 pt-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">New post</p>
          <textarea
            value={social.prompt}
            onChange={(e) => social.setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void social.author();
            }}
            placeholder="Describe the post — the AI builds it with real numbers…"
            rows={3}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-gulf-teal"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void social.author()}
              disabled={social.aiBusy}
              className="flex-1 rounded-lg bg-gulf-teal py-1.5 text-xs font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-40"
            >
              {social.aiBusy ? "Working…" : "Build post"}
            </button>
            <button
              type="button"
              onClick={() => void social.fill()}
              disabled={social.aiBusy}
              className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
            >
              Fill numbers
            </button>
          </div>
          {social.aiStatus && <p className="mt-1 text-[10px] text-gulf-teal">{social.aiStatus}</p>}
          {social.aiError && <p className="mt-1 text-[10px] text-amber-300/80">{social.aiError}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                onClick={() => social.addElement(p.type)}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50 hover:border-gulf-teal/40 hover:text-gulf-teal"
              >
                + {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void social.openSchedule()}
            disabled={!social.hasElements || social.exporting}
            className="mt-3 w-full rounded-lg border border-gulf-teal/40 py-2 text-xs font-semibold text-gulf-teal hover:bg-gulf-teal/10 disabled:opacity-40"
          >
            {social.exporting ? "Exporting…" : "Schedule this post"}
          </button>
          {social.exportError && (
            <p className="mt-1 text-[10px] text-amber-300/80">{social.exportError}</p>
          )}
        </div>

        <PhotosPanel
          projectPhotos={projectPhotos}
          promotingPath={social.promotingPath}
          onApplyUrl={social.applyPhotoUrl}
          onPickFiled={(p) => void social.pickFiledPhoto(p)}
          onUploadFile={(f) => void social.uploadNewPhoto(f)}
        />
      </aside>

      {/* Center — the composer canvas + inspector */}
      <section className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <SocialComposer composer={social} />
        {social.selectedElement && (
          <div className="mt-3">
            <SocialElementInspector
              element={social.selectedElement}
              onChange={social.updateElement}
              onDelete={social.deleteSelected}
              onClose={() => social.setSelectedId(null)}
            />
          </div>
        )}
      </section>

      {/* Right — card preview column */}
      <aside className="w-full shrink-0 overflow-y-auto lg:w-80">
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Card preview</p>
        {previewHtml == null ? (
          <p className="mt-2 text-xs text-white/40">
            Generate a week, then Load Card to preview a day&apos;s post here.
          </p>
        ) : previewHtml === "" ? (
          <p className="mt-2 text-xs text-amber-300/80">Preview failed — try again.</p>
        ) : (
          <>
            <iframe
              title="Card preview"
              srcDoc={previewHtml}
              className="mt-2 h-[480px] w-full rounded-lg border border-white/10 bg-white"
            />
            <button
              type="button"
              onClick={() => void editInEmail()}
              disabled={savingCard}
              className="mt-2 w-full rounded-lg border border-gulf-teal/40 py-2 text-xs font-semibold text-gulf-teal hover:bg-gulf-teal/10 disabled:opacity-40"
            >
              {savingCard ? "Saving…" : "Edit in Email"}
            </button>
          </>
        )}
      </aside>

      {scheduleDraft && (
        <ScheduleSocialModal
          draft={scheduleDraft}
          projectId={projectId}
          scopeKind={scope?.kind ?? null}
          scopeValue={scope?.value ?? null}
          onClose={() => setScheduleDraft(null)}
        />
      )}
      {social.scheduleOpen && (
        <ScheduleSocialModal
          draft={
            {
              day: "mon",
              theme: "composed",
              caption: social.caption,
              hashtags: social.hashtags,
              card: { globalStyle: {}, blocks: [] },
              variants: social.variants,
            } as unknown as SocialDraft
          }
          projectId={projectId}
          scopeKind={scope?.kind ?? null}
          scopeValue={scope?.value ?? null}
          mediaUrl={social.mediaUrl}
          design={social.design}
          onClose={() => social.setScheduleOpen(false)}
        />
      )}
    </div>
  );
}
