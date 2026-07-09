"use client";

import { useState, useEffect } from "react";
import type { Contact } from "@/lib/contacts/types";
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";

interface Props {
  deliverableId: string;
  /** Block-canvas emails can ship a generated PDF attachment — gates the checkbox. */
  isBlockCanvas: boolean;
  onClose: () => void;
  /** AI-authored subject-line alternatives (Task 5) — absent/empty → no picker UI, unchanged today's behavior. */
  subjectVariants?: string[];
  /** AI-authored CTA-label alternatives (Task 5) — absent/empty → no picker UI, unchanged today's behavior. */
  ctaVariants?: string[];
}

type SendResult = { sent: number; failed: number } | { error: string; limit?: number };

export function ContactPickerModal({
  deliverableId,
  isBlockCanvas,
  onClose,
  subjectVariants,
  ctaVariants,
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [attachPdf, setAttachPdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [splitTest, setSplitTest] = useState(false);
  const [ctaOverride, setCtaOverride] = useState<string | null>(null);
  const hasVariants = (subjectVariants?.length ?? 0) >= 2 || (ctaVariants?.length ?? 0) >= 2;

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : []))
      .then(setContacts)
      .catch(() => {});
  }, []);

  const allTags = Array.from(new Set(contacts.flatMap((c) => c.tags))).sort();
  const q = search.trim().toLowerCase();
  const visible = contacts.filter((c) => {
    if (c.unsubscribed) return false;
    const matchSearch =
      !q || c.email.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q);
    const matchTag = !activeTag || c.tags.includes(activeTag);
    return matchSearch && matchTag;
  });

  function toggleAll() {
    setSelected((prev) =>
      prev.size === visible.length ? new Set() : new Set(visible.map((c) => c.id)),
    );
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const variantTest =
        splitTest && hasVariants
          ? {
              ...((subjectVariants?.length ?? 0) >= 2 ? { subjects: subjectVariants } : {}),
              ...((ctaVariants?.length ?? 0) >= 2 ? { ctas: ctaVariants } : {}),
            }
          : ctaOverride
            ? { ctas: [ctaOverride] }
            : undefined;
      const res = await fetch(`/api/deliverables/${deliverableId}/blast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact_ids: Array.from(selected),
          ...(subject.trim() ? { subject: subject.trim() } : {}),
          ...(attachPdf ? { include_pdf: true } : {}),
          ...(variantTest ? { variant_test: variantTest } : {}),
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ error: "network error" });
    } finally {
      setSending(false);
    }
  }

  const sentOk = result && "sent" in result;
  const quota = result && "error" in result && result.error === "quota_reached";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[80dvh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#0d1e2b]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Send to contacts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ×
          </button>
        </div>

        {result ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            {sentOk ? (
              <>
                <div className="text-4xl">✓</div>
                <p className="text-lg font-semibold text-white">
                  Sent to {(result as { sent: number }).sent} contact
                  {(result as { sent: number }).sent !== 1 ? "s" : ""}
                </p>
                {(result as { failed: number }).failed > 0 && (
                  <p className="text-sm text-yellow-300">
                    {(result as { failed: number }).failed} failed to send
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="text-3xl">⚠</div>
                <p className="text-sm text-red-300">
                  {quota
                    ? "You've hit your monthly send limit. Upgrade to send more."
                    : `Couldn't send: ${(result as { error: string }).error}`}
                </p>
              </>
            )}
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-gulf-teal px-6 py-2 text-sm font-medium text-[#0a1419]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 border-b border-white/10 px-5 py-3">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject (optional — a clean default is used)"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
              />
              {(subjectVariants?.length ?? 0) >= 2 && !splitTest && (
                <div className="flex flex-wrap gap-1.5">
                  {subjectVariants!.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSubject(v)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        subject === v
                          ? "border-gulf-teal bg-gulf-teal/20 text-gulf-teal"
                          : "border-white/10 bg-white/5 text-white/50 hover:text-white/80"
                      }`}
                    >
                      {v.length > 40 ? `${v.slice(0, 40)}…` : v}
                    </button>
                  ))}
                </div>
              )}
              {(ctaVariants?.length ?? 0) >= 2 && !splitTest && (
                <div className="flex flex-wrap gap-1.5">
                  {ctaVariants!.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCtaOverride(v)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        ctaOverride === v
                          ? "border-gulf-teal bg-gulf-teal/20 text-gulf-teal"
                          : "border-white/10 bg-white/5 text-white/50 hover:text-white/80"
                      }`}
                    >
                      CTA: {v}
                    </button>
                  ))}
                </div>
              )}
              {hasVariants && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={splitTest}
                    onChange={(e) => setSplitTest(e.target.checked)}
                    className="h-4 w-4 accent-gulf-teal"
                  />
                  Split test this send (
                  {Math.max(subjectVariants?.length ?? 0, ctaVariants?.length ?? 0)} variants,
                  cohort-assigned)
                </label>
              )}
              {isBlockCanvas && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={attachPdf}
                    onChange={(e) => setAttachPdf(e.target.checked)}
                    className="h-4 w-4 accent-gulf-teal"
                  />
                  Attach PDF report
                </label>
              )}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
              />
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setActiveTag(null)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${!activeTag ? "bg-gulf-teal text-[#0a1419]" : "border border-white/10 text-gray-400"}`}
                  >
                    All
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${activeTag === tag ? "bg-gulf-teal text-[#0a1419]" : "border border-white/10 text-gray-400"}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  {contacts.length === 0 ? (
                    <>
                      No contacts yet —{" "}
                      <a href="/contacts" className="text-gulf-teal underline">
                        add some
                      </a>
                    </>
                  ) : (
                    "No contacts match"
                  )}
                </p>
              ) : (
                <>
                  <div
                    className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-5 py-3 hover:bg-white/5"
                    onClick={toggleAll}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={selected.size === visible.length && visible.length > 0}
                      className="h-4 w-4 accent-gulf-teal"
                    />
                    <span className="text-sm text-gray-400">
                      {selected.size === visible.length && visible.length > 0
                        ? "Deselect all"
                        : `Select all (${visible.length})`}
                    </span>
                  </div>
                  {visible.map((c) => (
                    <div
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-5 py-3 hover:bg-white/5"
                      onClick={() => toggle(c.id)}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={selected.has(c.id)}
                        className="h-4 w-4 accent-gulf-teal"
                      />
                      <div className="min-w-0 flex-1">
                        {c.name && (
                          <div className="truncate text-sm font-medium text-white">{c.name}</div>
                        )}
                        <div className="truncate text-xs text-gray-400">{c.email}</div>
                      </div>
                      {c.tags.length > 0 && (
                        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-400">
                          {c.tags[0]}
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="border-t border-white/10 px-5 py-4">
              <SendCeilingMeter variant="panel" />
              <button
                disabled={selected.size === 0 || sending}
                onClick={handleSend}
                className="w-full rounded-xl bg-gulf-teal py-2.5 text-sm font-semibold text-[#0a1419] disabled:opacity-40"
              >
                {sending
                  ? "Sending…"
                  : selected.size === 0
                    ? "Select contacts to send"
                    : `Send to ${selected.size} contact${selected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
