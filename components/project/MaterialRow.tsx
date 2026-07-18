"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeliverableRow } from "@/app/project/[id]/workspace/types";
import type { EmailBlock } from "@/lib/email/doc/types";
import { getMaterialStatus, getFormatBadge } from "@/lib/deliverable/material-status";
import { ContactPickerModal } from "@/components/contacts/ContactPickerModal";
import { openDoc } from "@/lib/lab-entry/destination";

/** Derive a human-readable title from the material's doc or fallback fields. */
export function deriveTitle(d: DeliverableRow): string {
  // Precedence is by FIELD, not document order: hero.label → hero.value →
  // header.tagline. Seeds are header-first and the default header carries a brand
  // tagline, so a document-order scan would title every material with the same
  // tagline and hide the distinguishing hero headline.
  const blocks = d.doc?.blocks ?? [];
  for (const b of blocks) if (b.type === "hero" && b.props.label) return b.props.label;
  for (const b of blocks) if (b.type === "hero" && b.props.value) return b.props.value;
  for (const b of blocks) if (b.type === "header" && b.props.tagline) return b.props.tagline;
  if (d.exec_summary) return d.exec_summary;
  const badge = getFormatBadge(d.template);
  const dt = new Date(d.created_at);
  const mon = dt.toLocaleString("en-US", { month: "short", year: "numeric" });
  return `${badge.label} · ${mon}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rowHref(d: { template: string; id: string }, projectId: string): string {
  return d.template === "block-canvas" ? openDoc(projectId, d.id) : `/p/${d.id}`;
}

const header = (blocks: EmailBlock[]) =>
  blocks.find((b): b is Extract<EmailBlock, { type: "header" }> => b.type === "header");
const hero = (blocks: EmailBlock[]) =>
  blocks.find((b): b is Extract<EmailBlock, { type: "hero" }> => b.type === "hero");

interface Props {
  d: DeliverableRow & { versions: DeliverableRow[] };
  projectId: string;
  onRefresh: (id: string) => Promise<void>;
  onTrash?: (id: string) => Promise<void>;
}

export function MaterialRow({ d, projectId, onRefresh, onTrash }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const badge = getFormatBadge(d.template);
  const status = getMaterialStatus(d);
  const title = deriveTitle(d);
  const swatchColor = d.doc?.globalStyle?.accentColor ?? badge.color;
  const href = rowHref(d, projectId);

  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await onRefresh(d.id);
    } finally {
      setRefreshing(false);
    }
  }

  // A saved Email Lab design renders as a VISUAL PREVIEW CARD of the actual email —
  // brand header + hero headline in the doc's own colors — not a one-line text row.
  const isBlockCanvas = d.template === "block-canvas" && !!d.doc;
  const blocks = d.doc?.blocks ?? [];
  const primaryColor = d.doc?.globalStyle?.primaryColor ?? "#0f1d24";
  const accentColor = d.doc?.globalStyle?.accentColor ?? badge.color;
  const h = header(blocks);
  const he = hero(blocks);
  const company = h?.props.companyName;
  const tagline = h?.props.tagline;
  const kicker = he?.props.kicker;
  const heroValue = he?.props.value;
  const heroLabel = he?.props.label;

  return (
    <div className="group relative">
      {isBlockCanvas ? (
        // ── Visual preview card ──
        <div
          role="button"
          tabIndex={0}
          onClick={() => router.push(href)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              router.push(href);
            }
          }}
          className="cursor-pointer overflow-hidden rounded-xl border border-white/10 transition-shadow hover:shadow-lg hover:shadow-black/30 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
        >
          {/* Brand masthead — the email's own primary color */}
          <div className="px-4 py-3" style={{ backgroundColor: primaryColor }}>
            <div className="truncate text-sm font-bold text-white">{company || "Your email"}</div>
            {tagline && (
              <div className="truncate text-[10px]" style={{ color: accentColor }}>
                {tagline}
              </div>
            )}
          </div>

          {/* Hero headline on a light "paper" body — reads like the real email */}
          <div className="bg-white px-4 py-4">
            {kicker && (
              <div
                className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: accentColor }}
              >
                {kicker}
              </div>
            )}
            <div className="text-2xl font-extrabold leading-tight" style={{ color: primaryColor }}>
              {heroValue || title}
            </div>
            {heroLabel && <div className="mt-0.5 text-xs text-gray-500">{heroLabel}</div>}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-4 border-t border-black/10 bg-gray-50 px-4 py-2">
            <span className="text-xs font-semibold text-gray-700">Open in Lab →</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSendOpen(true);
              }}
              className="text-xs text-gray-500 transition-colors hover:text-black"
            >
              Send
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(openDoc(projectId, d.id, { schedule: true }));
              }}
              className="text-xs text-gray-500 transition-colors hover:text-black"
            >
              Schedule
            </button>
            {status === "needs_update" && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-xs font-medium text-amber-600 transition-colors hover:text-amber-700 disabled:opacity-50"
              >
                {refreshing ? "Updating…" : "Update ↻"}
              </button>
            )}
            <span
              className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
            >
              email
            </span>
          </div>
        </div>
      ) : (
        // ── Compact text row (reports / non-EmailDoc materials) ──
        <div
          role="button"
          tabIndex={0}
          onClick={() => router.push(href)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              router.push(href);
            }
          }}
          className="relative flex cursor-pointer items-center gap-3 border-b border-white/[0.08] py-3 pl-4 pr-3 hover:bg-white/[0.03] focus:outline-none focus:ring-inset focus:ring-1 focus:ring-gulf-teal/40"
        >
          {/* 4px brand swatch bar */}
          <div
            className="absolute left-0 top-0 h-full w-1 rounded-l"
            style={{ backgroundColor: swatchColor }}
            aria-hidden="true"
          />

          {/* Title */}
          <span className="flex-1 truncate text-sm text-white/85">{title}</span>

          {/* Format badge */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.bg}`}
            style={{ color: badge.color }}
          >
            {badge.label}
          </span>

          {/* Status: amber update affordance */}
          {status === "needs_update" && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {refreshing ? "Updating…" : "Update ↻"}
            </button>
          )}

          {/* Send to contacts */}
          <button
            title="Send to contacts"
            onClick={(e) => {
              e.stopPropagation();
              setSendOpen(true);
            }}
            className="shrink-0 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Send
          </button>
        </div>
      )}

      {/* Version accordion sub-rows (shared by both layouts) */}
      {d.versions.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-3 pl-1">
          <button
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-white/40 transition-colors hover:text-white/70"
          >
            {d.versions.length} earlier {d.versions.length === 1 ? "version" : "versions"}{" "}
            {open ? "⌃" : "⌄"}
          </button>
          {open &&
            d.versions.map((v) => {
              const vHref = rowHref(v, projectId);
              return (
                <span key={v.id} className="flex items-center gap-2">
                  <span className="text-[11px] text-white/35">{formatDate(v.created_at)}</span>
                  <button
                    onClick={() => router.push(vHref)}
                    className="text-[11px] text-white/50 transition-colors hover:text-white/80"
                  >
                    Open
                  </button>
                  {onTrash && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTrash(v.id);
                      }}
                      className="text-[11px] text-white/30 transition-colors hover:text-red-400"
                    >
                      Trash
                    </button>
                  )}
                </span>
              );
            })}
        </div>
      )}

      {/* Send-to-contacts modal (fixed inset-0 overlay; stops its own propagation) */}
      {sendOpen && (
        <ContactPickerModal
          deliverableId={d.id}
          isBlockCanvas={d.template === "block-canvas"}
          onClose={() => setSendOpen(false)}
        />
      )}
    </div>
  );
}
