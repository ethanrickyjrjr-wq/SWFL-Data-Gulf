"use client";

import { useState, useEffect, useMemo } from "react";
import type { Contact } from "@/lib/contacts/types";
import type { Condition } from "@/lib/email/segments/filter";
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";
import { BlastResultsPanel } from "./BlastResultsPanel";
import { makeDebouncedRunner } from "@/lib/contacts/segment-preview-debounce";

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
type SentDeliverable = { id: string; label: string };

/** One condition row in the builder UI. Compiles to a filter.ts Condition via
 *  uiConditionToAst — the picker never emits raw SQL or free text. */
type UiCondition =
  | { kind: "tag"; mode: "has_any" | "not_any"; values: string[] }
  | { kind: "attrib"; key: string; op: "eq" | "gt" | "lt" | "contains"; value: string }
  | { kind: "engagement"; op: "opened" | "clicked" | "never_opened"; deliverableId: string };

function uiConditionToAst(c: UiCondition): Condition {
  if (c.kind === "tag") {
    const or: Condition = { or: c.values.map((value) => ({ field: "tags", op: "has", value })) };
    return c.mode === "has_any" ? or : { not: or };
  }
  if (c.kind === "attrib") {
    return { field: "attribs", key: c.key, op: c.op, value: c.value };
  }
  return { field: "engagement", op: c.op, deliverable_id: c.deliverableId };
}

/** All conditions are ANDed together. Empty → null (no filter — the caller
 *  falls back to the client-side "all contacts" view, today's behavior). */
function conditionsToFilter(conditions: UiCondition[]): Condition | null {
  if (conditions.length === 0) return null;
  return { and: conditions.map(uiConditionToAst) };
}

export function ContactPickerModal({
  deliverableId,
  isBlockCanvas,
  onClose,
  subjectVariants,
  ctaVariants,
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tier, setTier] = useState<"free" | "paid">("free");
  const [search, setSearch] = useState("");
  const [conditions, setConditions] = useState<UiCondition[]>([]);
  const [matched, setMatched] = useState<Contact[] | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [sentDeliverables, setSentDeliverables] = useState<SentDeliverable[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [attachPdf, setAttachPdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [splitTest, setSplitTest] = useState(false);
  const [ctaOverride, setCtaOverride] = useState<string | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const hasVariants = (subjectVariants?.length ?? 0) >= 2 || (ctaVariants?.length ?? 0) >= 2;

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [], tier: "free" }))
      .then((body: { contacts: Contact[]; tier: "free" | "paid" }) => {
        setContacts(body.contacts ?? []);
        setTier(body.tier ?? "free");
        if (body.tier === "paid") {
          fetch("/api/deliverables/sent")
            .then((r) => (r.ok ? r.json() : []))
            .then(setSentDeliverables)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const filter = useMemo(() => conditionsToFilter(conditions), [conditions]);
  // Tracks the filter value isResolving was last armed/cleared for.
  const [firedFilter, setFiredFilter] = useState<Condition | null>(null);

  // Set-state-during-render (react.dev "Adjusting state when a prop changes"):
  // `filter` is a fresh object every condition edit (useMemo recomputes off
  // `conditions`), so comparing it against `firedFilter` catches every edit,
  // arming/clearing `isResolving` immediately and converging on the next
  // render — never a synchronous setState inside the effect below, which is
  // what `react-hooks/set-state-in-effect` flags.
  if (filter !== firedFilter) {
    setFiredFilter(filter);
    setIsResolving(!!filter);
  }

  // Resolve matches server-side whenever the filter changes (attribs/engagement
  // conditions can't be evaluated client-side — the picker doesn't hold
  // email_events). With no filter the effect does nothing and `base` (below)
  // falls back to the plain client-side contact list — see the `filter ? …`
  // guard where `base` is computed, which makes any stale `matched` irrelevant
  // once the filter is cleared. This debounces via makeDebouncedRunner —
  // otherwise rapid edits fire one request per keystroke and flash whichever
  // intermediate result lands (contact_picker_no_preview_debounce).
  useEffect(() => {
    if (!filter) return;
    let cancelled = false;
    const runner = makeDebouncedRunner();
    runner.schedule(() => {
      fetch("/api/segments/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filter }),
      })
        .then((r) => (r.ok ? r.json() : { contacts: [] }))
        .then((body: { contacts: Contact[] }) => {
          if (!cancelled) {
            setMatched(body.contacts ?? []);
            setIsResolving(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMatched([]);
            setIsResolving(false);
          }
        });
    });
    return () => {
      cancelled = true;
      runner.cancel();
    };
  }, [filter]);

  const allTags = Array.from(new Set(contacts.flatMap((c) => c.tags))).sort();
  const q = search.trim().toLowerCase();
  const base = filter ? (matched ?? contacts) : contacts;
  const visible = base.filter((c) => {
    if (c.unsubscribed) return false;
    const matchSearch =
      !q || c.email.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q);
    return matchSearch;
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

  function addTagCondition() {
    setConditions((prev) => [...prev, { kind: "tag", mode: "has_any", values: [] }]);
  }
  function addAttribCondition() {
    setConditions((prev) => [...prev, { kind: "attrib", key: "", op: "eq", value: "" }]);
  }
  function addEngagementCondition() {
    if (sentDeliverables.length === 0) return;
    setConditions((prev) => [
      ...prev,
      { kind: "engagement", op: "opened", deliverableId: sentDeliverables[0].id },
    ]);
  }
  function updateCondition(i: number, next: UiCondition) {
    setConditions((prev) => prev.map((c, idx) => (idx === i ? next : c)));
  }
  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveSegment() {
    if (!filter || !segmentName.trim()) return;
    await fetch("/api/segments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: segmentName.trim(), filter }),
    }).catch(() => {});
    setSegmentName("");
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
                {(subjectVariants?.length ?? 0) >= 2 || (ctaVariants?.length ?? 0) >= 2 ? (
                  <BlastResultsPanel deliverableId={deliverableId} />
                ) : null}
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
              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs"
                  >
                    {c.kind === "tag" && (
                      <>
                        <select
                          value={c.mode}
                          onChange={(e) =>
                            updateCondition(i, {
                              ...c,
                              mode: e.target.value as "has_any" | "not_any",
                            })
                          }
                          className="rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          <option value="has_any">has any of</option>
                          <option value="not_any">has none of</option>
                        </select>
                        <div className="flex flex-1 flex-wrap gap-1">
                          {allTags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                updateCondition(i, {
                                  ...c,
                                  values: c.values.includes(tag)
                                    ? c.values.filter((v) => v !== tag)
                                    : [...c.values, tag],
                                })
                              }
                              className={`rounded-full px-2 py-0.5 ${c.values.includes(tag) ? "bg-gulf-teal text-[#0a1419]" : "border border-white/10 text-gray-400"}`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {c.kind === "attrib" && tier === "paid" && (
                      <>
                        <input
                          value={c.key}
                          onChange={(e) => updateCondition(i, { ...c, key: e.target.value })}
                          placeholder="attribute (e.g. city)"
                          className="w-28 rounded bg-white/10 px-1.5 py-1 text-white placeholder-gray-500"
                        />
                        <select
                          value={c.op}
                          onChange={(e) =>
                            updateCondition(i, {
                              ...c,
                              op: e.target.value as "eq" | "gt" | "lt" | "contains",
                            })
                          }
                          className="rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          <option value="eq">=</option>
                          <option value="contains">contains</option>
                          <option value="gt">&gt;</option>
                          <option value="lt">&lt;</option>
                        </select>
                        <input
                          value={c.value}
                          onChange={(e) => updateCondition(i, { ...c, value: e.target.value })}
                          placeholder="value"
                          className="flex-1 rounded bg-white/10 px-1.5 py-1 text-white placeholder-gray-500"
                        />
                      </>
                    )}
                    {c.kind === "engagement" && tier === "paid" && (
                      <>
                        <select
                          value={c.op}
                          onChange={(e) =>
                            updateCondition(i, {
                              ...c,
                              op: e.target.value as "opened" | "clicked" | "never_opened",
                            })
                          }
                          className="rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          <option value="opened">opened</option>
                          <option value="clicked">clicked</option>
                          <option value="never_opened">never opened</option>
                        </select>
                        <select
                          value={c.deliverableId}
                          onChange={(e) =>
                            updateCondition(i, { ...c, deliverableId: e.target.value })
                          }
                          className="flex-1 rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          {sentDeliverables.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <button
                      onClick={() => removeCondition(i)}
                      className="text-gray-500 hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={addTagCondition}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:text-white"
                  >
                    + tag condition
                  </button>
                  {tier === "paid" && (
                    <>
                      <button
                        type="button"
                        onClick={addAttribCondition}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:text-white"
                      >
                        + attribute condition
                      </button>
                      {sentDeliverables.length > 0 && (
                        <button
                          type="button"
                          onClick={addEngagementCondition}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:text-white"
                        >
                          + engagement condition
                        </button>
                      )}
                    </>
                  )}
                </div>
                {tier === "free" && (
                  <p className="text-[11px] text-gray-500">
                    Attribute and engagement conditions are a paid feature — tag filtering is free.
                  </p>
                )}
                {isResolving && <p className="text-[11px] text-gray-500">Updating matches…</p>}
                {filter && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      value={segmentName}
                      onChange={(e) => setSegmentName(e.target.value)}
                      placeholder="Save as segment…"
                      className="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white placeholder-gray-500"
                    />
                    <button
                      type="button"
                      onClick={saveSegment}
                      disabled={!segmentName.trim()}
                      className="rounded-full bg-gulf-teal px-2.5 py-1 text-xs font-medium text-[#0a1419] disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`flex-1 overflow-y-auto ${isResolving ? "opacity-50 transition-opacity" : ""}`}
            >
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
