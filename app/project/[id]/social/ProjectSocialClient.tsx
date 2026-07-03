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
import { ExamplesAccordion } from "@/components/showcase/ExamplesAccordion";
import type { SocialElement } from "@/lib/social/design/types";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/social/formats";
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

// Element palette for the "Add" section (mirrors the grid shell's private
// SOCIAL_PALETTE — chart is author-seeded, never palette-added).
const PALETTE: { type: SocialElement["type"]; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "stat", label: "Stat" },
  { type: "cta", label: "Button + link" },
  { type: "image", label: "Image" },
  { type: "logo", label: "Logo" },
];

const SOCIAL_FORMAT_LABEL: Record<SocialFormat, string> = {
  square: "Square 1:1",
  portrait: "Portrait 4:5",
  landscape: "Landscape 1.91:1",
  story: "Story 9:16",
};

// Cockpit D3 — the Social tool as a full page. LAYOUT IS THE GRID SHELL'S,
// RESTORED (operator ruling 07/03/2026): canvas fills the left, ONE right
// "AI assistant" aside holds every control — Build with AI, inspector,
// Add/Size, Social calendar, Card preview, Photos. Never move the controls
// to a left rail again. Surface move only: publish engine (lib/social/) and
// calendar system (lib/email/social-calendar/) remain two systems.
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
  const [showCalendar, setShowCalendar] = useState(true);
  // Card-preview section: the day card rendered to email HTML with project brand.
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
  // preview section (brand applied client-side, the established card path).
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
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_380px]">
      {/* ══════════ CENTER-LEFT: the canvas fills the space ══════════ */}
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-baseline gap-3 border-b border-white/8 px-4 py-2.5">
          <Link
            href={`/project/${projectId}`}
            className="flex items-center gap-1.5 text-[10px] text-white/35 transition-colors hover:text-white/60"
          >
            ← {projectTitle}
          </Link>
          <p className="text-sm font-semibold text-white/80">Social</p>
          <p className="text-[10px] text-gulf-teal">
            {scope
              ? `Scope: ${scope.kind === "zip" ? "ZIP " : ""}${scope.value}`
              : "Southwest Florida"}
            {" · real data enabled"}
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <SocialComposer composer={social} />
        </div>
      </main>

      {/* ══════════ RIGHT: AI assistant (full height) — the grid shell's aside ══════════ */}
      <aside className="flex min-h-0 flex-col overflow-hidden border-l border-[#0a141a] bg-[#0f1d24]">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-4 py-3">
          <span className="text-gulf-teal">✦</span>
          <span className="text-sm font-semibold text-white/85">AI assistant</span>
          {social.aiBusy && (
            <span className="ml-auto inline-block h-3 w-3 animate-spin rounded-full border-2 border-gulf-teal/30 border-t-gulf-teal" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Build with AI ── */}
          <div className="border-b border-white/8 px-4 pb-4 pt-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
              Build with AI
            </p>
            <textarea
              value={social.prompt}
              onChange={(e) => social.setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void social.author();
              }}
              placeholder="Describe the post — the AI builds it with real numbers…"
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none focus:ring-1 focus:ring-gulf-teal"
            />
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => void social.author()}
                disabled={social.aiBusy || !social.prompt.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] transition-colors hover:bg-[#17a3b3] disabled:opacity-40"
              >
                {social.aiBusy ? "Working…" : "Build the post"}
              </button>
              <button
                type="button"
                onClick={() => void social.fill()}
                disabled={social.aiBusy}
                title="Fill cited copy into the current canvas (keeps your elements)"
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 transition-colors hover:text-white/90 disabled:opacity-40"
              >
                Fill
              </button>
            </div>
            {social.aiStatus && (
              <p className="mt-2.5 rounded-md border border-gulf-teal/20 bg-gulf-teal/10 px-2.5 py-2 text-[11px] text-gulf-teal/90">
                ✓ {social.aiStatus}
              </p>
            )}
            {social.aiError && (
              <p className="mt-2 text-[11px] text-amber-300/80">{social.aiError}</p>
            )}
            <button
              type="button"
              onClick={() => void social.openSchedule()}
              disabled={!social.hasElements || social.exporting}
              className="mt-3 w-full rounded-lg border border-gulf-teal/40 py-2 text-xs font-semibold text-gulf-teal hover:bg-gulf-teal/10 disabled:opacity-40"
            >
              {social.exporting ? "Exporting…" : "Schedule this post"}
            </button>
            {social.exportError && (
              <p className="mt-2 text-[11px] text-amber-300/80">{social.exportError}</p>
            )}
          </div>

          {/* ── Now editing (the selected canvas element) ── */}
          {social.selectedElement && (
            <div className="border-b border-white/8 px-4 pb-4 pt-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#f59e0b]">
                Now editing
              </p>
              <div className="mt-3 rounded-lg bg-white p-3 text-gray-900">
                <SocialElementInspector
                  element={social.selectedElement}
                  onChange={social.updateElement}
                  onDelete={social.deleteSelected}
                  onClose={() => social.setSelectedId(null)}
                />
              </div>
            </div>
          )}

          {/* ── Add / size ── */}
          <div className="border-b border-white/8 px-4 pb-4 pt-3">
            <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-white/35">Add</p>
            <div className="grid grid-cols-2 gap-1">
              {PALETTE.map((p) => (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => social.addElement(p.type)}
                  className="rounded border border-white/10 px-2 py-1.5 text-[11px] text-white/60 hover:text-white/90"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mb-1.5 mt-3 text-[10px] uppercase tracking-[0.15em] text-white/35">
              Size
            </p>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => social.setFormat(f)}
                  className={`rounded border px-2 py-1 text-left text-[11px] ${
                    social.design.format === f
                      ? "border-gulf-teal text-gulf-teal"
                      : "border-white/10 text-white/55"
                  }`}
                >
                  {SOCIAL_FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Social calendar (Generate Week) ── */}
          <div className="border-b border-white/8 px-4 pb-4 pt-3">
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
            >
              <span>Social calendar</span>
              <span className={`transition-transform ${showCalendar ? "rotate-180" : ""}`}>▾</span>
            </button>
            {showCalendar && (
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
            )}
          </div>

          {/* ── Card preview (Load Card from the calendar renders here) ── */}
          {previewHtml != null && (
            <div className="border-b border-white/8 px-4 pb-4 pt-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Card preview</p>
              {previewHtml === "" ? (
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
            </div>
          )}

          {/* ── Photos ── */}
          <PhotosPanel
            projectPhotos={projectPhotos}
            promotingPath={social.promotingPath}
            onApplyUrl={social.applyPhotoUrl}
            onPickFiled={(p) => void social.pickFiledPhoto(p)}
            onUploadFile={(f) => void social.uploadNewPhoto(f)}
          />
        </div>

        {/* Social showcases, closed by default — same operator ruling as the
            Email lab: examples in the lab they demonstrate, never in the AI. */}
        <div className="mt-4">
          <ExamplesAccordion surface="social" />
        </div>
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
