"use client";
import Link from "next/link";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";

const REPORT_TEMPLATES = [
  { id: "market-overview", label: "Market overview" },
  { id: "bov-lite", label: "Broker opinion" },
  { id: "client-email", label: "Client email" },
  { id: "one-pager", label: "One-pager" },
  { id: "email", label: "Email digest" },
] as const;

export function TemplateRail({
  projectId,
  highlight = false,
  onBuildReport,
}: {
  projectId: string;
  highlight?: boolean;
  onBuildReport?: (templateId: string) => void;
}) {
  return (
    <div className="mt-4 space-y-5">
      {/* Email starters */}
      <div className="flex flex-wrap gap-2">
        {SEED_DOCS.map((s) => (
          <Link
            key={s.id}
            href={`/project/${projectId}/email-lab?seed=${s.id}`}
            className={[
              "rounded-lg border px-3 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-gulf-teal/40",
              "hover:border-gulf-teal/60 hover:bg-gulf-teal/[0.06]",
              highlight
                ? "border-gulf-teal/50 bg-gulf-teal/[0.05]"
                : "border-white/10 bg-white/[0.02]",
            ].join(" ")}
          >
            <p className="text-sm font-medium text-white/85 leading-tight">{s.name}</p>
            <p className="mt-0.5 text-xs text-white/40 leading-snug">{s.description}</p>
          </Link>
        ))}
      </div>

      {/* Report templates — quieter group, only when wired */}
      {onBuildReport && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/30">
            …or build a report
          </p>
          <div className="flex flex-wrap gap-2">
            {REPORT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onBuildReport(t.id)}
                className="rounded-lg border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/70 focus:outline-none focus:ring-2 focus:ring-gulf-teal/40"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
