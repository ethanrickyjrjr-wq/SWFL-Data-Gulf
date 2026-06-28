"use client";

import Link from "next/link";
import { useState } from "react";
import { EmailLabShell } from "@/components/email-lab/EmailLabShell";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

interface Props {
  projectId: string;
  projectTitle: string;
  /** Project branding mapped to email tokens by the page (PRIMARY, ACCENT,
   *  COMPANY_NAME, AGENT_*, CTA_URL, …). The shell applies these onto the doc's
   *  globalStyle + brand-bearing blocks. */
  initialTokens: Record<string, string>;
  /** The raw project branding blob (snake_case) — seeds the lab's live Brand
   *  panel so editing brand here writes back to the SAME projects.branding. */
  initialBranding?: Record<string, string>;
  scope?: { kind: string; value: string } | null;
  initialDoc?: EmailDoc | null;
  deliverableId?: string | null;
  /** Re-open the Schedule modal on mount (set when returning from contacts-upload). */
  autoOpenSchedule?: boolean;
  projectPhotos?: { storage_path: string; signedUrl: string; caption?: string }[];
}

// Project-scoped Email Lab — block canvas with the project's brand + lake scope.
// Auto-fills on mount when no saved doc is loaded (?did absent).
export function ProjectEmailLabClient({
  projectId,
  projectTitle,
  initialTokens,
  initialBranding,
  scope,
  initialDoc,
  deliverableId,
  autoOpenSchedule,
  projectPhotos,
}: Props) {
  const [savedId, setSavedId] = useState<string | null>(deliverableId ?? null);
  const [saving, setSaving] = useState(false);
  const [doc0] = useState<EmailDoc>(() => initialDoc ?? defaultDoc());

  const scopeLabel = scope
    ? `${scope.kind === "zip" ? "ZIP " : ""}${scope.value}`
    : "Southwest Florida";
  const effectiveScope = scope ?? { kind: "region", value: "swfl" };
  const aiPrompt = `Market spotlight email for ${scopeLabel} — fill in realistic market context and agent copy`;

  // `ai_prompt` is persisted as the deliverable's build prompt so a SCHEDULED re-render
  // reproduces this exact email — chart included — with fresh data each occurrence (the
  // chart selector keys off the prompt; without it a scheduled send loses the chart).
  async function handleSave(doc: EmailDoc, aiPrompt: string): Promise<string | void> {
    setSaving(true);
    try {
      if (savedId) {
        await fetch(`/api/projects/${projectId}/materials`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliverable_id: savedId, doc, ai_prompt: aiPrompt }),
        });
        return savedId;
      }
      const res = await fetch(`/api/projects/${projectId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, ai_prompt: aiPrompt }),
      });
      if (res.ok) {
        const { id } = await res.json();
        setSavedId(id);
        window.history.replaceState({}, "", `/project/${projectId}/email-lab?did=${id}`);
        return id;
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <EmailLabShell
      initialDoc={doc0}
      brandTokens={initialTokens}
      initialBranding={initialBranding}
      scope={effectiveScope}
      initialAiPrompt={aiPrompt}
      autoGenerate={!deliverableId}
      aiPlaceholder={`e.g. Listing announcement for ${scopeLabel} — 3BR condo, pool view, under market…`}
      onSave={handleSave}
      saving={saving}
      autoOpenSchedule={autoOpenSchedule}
      deliverableId={savedId}
      projectId={projectId}
      projectPhotos={projectPhotos}
      headerSlot={
        <>
          <Link
            href={`/project/${projectId}`}
            className="mb-2 flex items-center gap-1.5 text-[10px] text-white/35 transition-colors hover:text-white/60"
          >
            ← {projectTitle}
          </Link>
          <p className="text-sm font-semibold text-white/80">Email Lab</p>
          <p className="mt-0.5 text-[10px] text-gulf-teal">
            {scope ? `Scope: ${scopeLabel}` : "Southwest Florida"} · real data enabled
          </p>
        </>
      }
    />
  );
}
