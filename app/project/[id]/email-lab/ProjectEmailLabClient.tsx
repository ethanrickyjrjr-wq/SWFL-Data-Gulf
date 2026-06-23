"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmailPreviewFrame } from "@/app/p/[id]/EmailPreviewFrame";

const TEMPLATES = [
  // ── Property / Listing
  { id: "email/email-listing", label: "New Listing", icon: "🏠" },
  { id: "email/email-just-sold", label: "Just Sold", icon: "✅" },
  { id: "email/email-open-house", label: "Open House", icon: "🔑" },
  { id: "email/email-price-drop", label: "Price Drop", icon: "📉" },
  // ── Agent / Brand
  { id: "email/email-agent-intro", label: "Agent Intro", icon: "👤" },
  // ── Neighborhood / Market
  { id: "email/email-neighborhood", label: "Neighborhood", icon: "📍" },
  // ── Market Data
  { id: "email/email-hero", label: "Hero Digest", icon: "⚡" },
  { id: "email/email-market-snapshot", label: "Snapshot", icon: "📊" },
  { id: "email/email-report", label: "Full Report", icon: "📋" },
  { id: "email/email-hbar", label: "Bar Chart", icon: "📊" },
  { id: "email/email-ranked", label: "Ranked List", icon: "🏆" },
  { id: "email/email-table", label: "Data Table", icon: "📈" },
  { id: "email/email-compare", label: "Compare", icon: "↔" },
  { id: "email/email-outreach", label: "Outreach", icon: "✉" },
  // ── Shells
  { id: "email/shell-two-col", label: "Two Column", icon: "⊞" },
  { id: "email/shell-single", label: "Single", icon: "▤" },
  { id: "email/shell-alert", label: "Alert", icon: "🔔" },
];

type Tokens = Record<string, string>;

const BASE_DEFAULTS: Tokens = {
  PRIMARY: "#0f1d24",
  ACCENT: "#1BB8C9",
  COMPANY_NAME: "SWFL Data Gulf",
  TAGLINE: "Southwest Florida Intelligence",
  WEBSITE_URL: "https://www.swfldatagulf.com",
  CONTACT_EMAIL: "hello@swfldatagulf.com",
  CONTACT_PHONE: "(239) 555-5555",
  HERO_KICKER: "Market Spotlight",
  HERO_VALUE: "—",
  HERO_LABEL: "Southwest Florida",
  HERO_PROSE: "Generate with AI to fill in real numbers for this project.",
  STAT1_VALUE: "—",
  STAT1_LABEL: "Median DOM",
  STAT2_VALUE: "—",
  STAT2_LABEL: "Months of Supply",
  STAT3_VALUE: "—",
  STAT3_LABEL: "Sale / List Ratio",
  SIGNAL_KICKER: "Signal to Watch",
  SIGNAL_TITLE: "This week in Southwest Florida",
  SIGNAL_BODY: "Use Generate with AI to pull real data for this project scope.",
  // property / agent / listing
  PROPERTY_PHOTO_URL: "",
  PROPERTY_ADDRESS: "123 Gulf Shore Blvd, Naples, FL 34102",
  PROPERTY_PRICE: "$850,000",
  PROPERTY_BEDS: "4",
  PROPERTY_BATHS: "3",
  PROPERTY_SQFT: "2,850",
  PROPERTY_TYPE: "Single Family",
  AGENT_PHOTO_URL: "",
  AGENT_NAME: "Your Name",
  AGENT_TITLE: "Licensed Real Estate Agent",
  AGENT_BIO:
    "Helping buyers and sellers navigate Southwest Florida real estate with local expertise and market intelligence.",
  NEIGHBORHOOD_PHOTO_URL: "",
  NEIGHBORHOOD_NAME: "Naples Park",
  EVENT_DATE: "Saturday, July 12",
  EVENT_TIME: "12:00 PM – 3:00 PM",
  CTA_URL: "https://www.swfldatagulf.com",
  CTA_LABEL: "View Listing",
  PRICE_FROM: "$925,000",
  PRICE_TO: "$850,000",
  REDUCE_PCT: "8.1%",
};

const FINE_TUNE_GROUPS = [
  {
    label: "Brand",
    fields: [
      { key: "PRIMARY", label: "Primary", type: "color" },
      { key: "ACCENT", label: "Accent", type: "color" },
      { key: "COMPANY_NAME", label: "Company name", type: "text" },
      { key: "TAGLINE", label: "Tagline / brokerage", type: "text" },
    ],
  },
  {
    label: "Hero",
    fields: [
      { key: "HERO_KICKER", label: "Kicker", type: "text" },
      { key: "HERO_VALUE", label: "Value", type: "text" },
      { key: "HERO_LABEL", label: "Label", type: "text" },
      { key: "HERO_PROSE", label: "Prose", type: "textarea" },
    ],
  },
  {
    label: "Stats",
    fields: [
      { key: "STAT1_VALUE", label: "Stat 1", type: "text" },
      { key: "STAT1_LABEL", label: "Label", type: "text" },
      { key: "STAT2_VALUE", label: "Stat 2", type: "text" },
      { key: "STAT2_LABEL", label: "Label", type: "text" },
      { key: "STAT3_VALUE", label: "Stat 3", type: "text" },
      { key: "STAT3_LABEL", label: "Label", type: "text" },
    ],
  },
  {
    label: "Signal",
    fields: [
      { key: "SIGNAL_TITLE", label: "Title", type: "text" },
      { key: "SIGNAL_BODY", label: "Body", type: "textarea" },
    ],
  },
  {
    label: "Property",
    fields: [
      { key: "PROPERTY_PHOTO_URL", label: "Photo URL", type: "text" },
      { key: "PROPERTY_ADDRESS", label: "Address", type: "text" },
      { key: "PROPERTY_PRICE", label: "Price", type: "text" },
      { key: "PROPERTY_BEDS", label: "Beds", type: "text" },
      { key: "PROPERTY_BATHS", label: "Baths", type: "text" },
      { key: "PROPERTY_SQFT", label: "Sq Ft", type: "text" },
      { key: "PROPERTY_TYPE", label: "Type", type: "text" },
    ],
  },
  {
    label: "Agent",
    fields: [
      { key: "AGENT_PHOTO_URL", label: "Headshot URL", type: "text" },
      { key: "AGENT_NAME", label: "Name", type: "text" },
      { key: "AGENT_TITLE", label: "Title", type: "text" },
      { key: "AGENT_BIO", label: "Bio", type: "textarea" },
      { key: "CTA_URL", label: "CTA URL", type: "text" },
      { key: "CTA_LABEL", label: "CTA Label", type: "text" },
    ],
  },
  {
    label: "Event / Price",
    fields: [
      { key: "EVENT_DATE", label: "Date", type: "text" },
      { key: "EVENT_TIME", label: "Time", type: "text" },
      { key: "PRICE_FROM", label: "Original Price", type: "text" },
      { key: "PRICE_TO", label: "Reduced Price", type: "text" },
      { key: "REDUCE_PCT", label: "Reduction %", type: "text" },
      { key: "NEIGHBORHOOD_PHOTO_URL", label: "Neighborhood Photo", type: "text" },
      { key: "NEIGHBORHOOD_NAME", label: "Neighborhood", type: "text" },
    ],
  },
];

async function fetchRender(template: string, tokens: Tokens): Promise<string> {
  const res = await fetch("/api/email-lab/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template, tokens }),
  });
  return (await res.json()).html ?? "";
}

async function fetchAiTokens(
  prompt: string,
  currentTokens: Tokens,
  scope?: { kind?: string; value?: string },
): Promise<Partial<Tokens>> {
  const res = await fetch("/api/email-lab/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentTokens, scope }),
  });
  return (await res.json()).tokens ?? {};
}

interface Props {
  projectId: string;
  projectTitle: string;
  initialTokens: Tokens;
  scope?: { kind: string; value: string };
}

export function ProjectEmailLabClient({ projectId, projectTitle, initialTokens, scope }: Props) {
  const mergedDefaults = { ...BASE_DEFAULTS, ...initialTokens };

  const [template, setTemplate] = useState(TEMPLATES[0].id);
  const [tokens, setTokens] = useState<Tokens>(mergedDefaults);
  const [html, setHtml] = useState("");
  const [rendering, setRendering] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showFineTune, setShowFineTune] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>("Hero");
  const [copied, setCopied] = useState(false);
  const renderRef = useRef(0);

  const render = useCallback(async (tpl: string, toks: Tokens) => {
    const id = ++renderRef.current;
    setRendering(true);
    try {
      const h = await fetchRender(tpl, toks);
      if (id === renderRef.current) setHtml(h);
    } finally {
      if (id === renderRef.current) setRendering(false);
    }
  }, []);

  // Re-render on template change — no synchronous setState in effect body
  useEffect(() => {
    const id = ++renderRef.current;
    fetchRender(template, tokens).then((h) => {
      if (id === renderRef.current) setHtml(h);
    });
  }, [template]); // eslint-disable-line react-hooks/exhaustive-deps

  function setToken(key: string, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const updates = await fetchAiTokens(aiPrompt, tokens, effectiveScope);
      const clean = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined),
      ) as Tokens;
      const next = { ...tokens, ...clean };
      setTokens(next);
      await render(template, next);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCopyHtml() {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExportPdf() {
    const printHtml = await fetchRender("email/email-print", tokens);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(printHtml);
    win.document.close();
    win.addEventListener("load", () => win.print());
    setTimeout(() => win.print(), 400);
  }

  // Always have a scope — fall back to region-wide if no ZIP/county inferred from items
  const effectiveScope = scope ?? { kind: "region", value: "swfl" };
  const scopeLabel = scope
    ? `${scope.kind === "zip" ? "ZIP " : ""}${scope.value}`
    : "Southwest Florida";

  return (
    <div className="grid grid-cols-[340px_1fr] h-dvh overflow-hidden bg-[#070f14] text-white">
      {/* ══════════ LEFT PANEL ══════════ */}
      <aside className="flex flex-col border-r border-white/8 overflow-hidden">
        {/* Header with back link */}
        <div className="px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
          <Link
            href={`/project/${projectId}`}
            className="flex items-center gap-1.5 text-[10px] text-white/35 hover:text-white/60 transition-colors mb-2"
          >
            ← {projectTitle}
          </Link>
          <p className="text-sm font-semibold text-white/80">Email Lab</p>
          <p className="text-[10px] text-[#1BB8C9] mt-0.5">
            {scope ? `Scope: ${scopeLabel}` : "Southwest Florida"} · real data enabled
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── AI Prompt ── */}
          <div className="px-4 pt-4 pb-4 border-b border-white/8">
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#1BB8C9] mb-2 font-medium">
              AI Generate
            </p>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAiGenerate();
              }}
              placeholder={`e.g. Listing announcement for ${scopeLabel} — 3BR condo, pool view, under market…`}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-[#1BB8C9] focus:border-[#1BB8C9]/50 transition-colors"
            />
            <button
              onClick={handleAiGenerate}
              disabled={aiLoading || !aiPrompt.trim()}
              className="mt-2 w-full py-2 rounded-lg bg-[#1BB8C9] hover:bg-[#17a3b3] disabled:opacity-40 text-sm font-semibold text-[#070f14] transition-colors flex items-center justify-center gap-2"
            >
              {aiLoading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-[#070f14]/30 border-t-[#070f14] rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate with AI"
              )}
            </button>
            <p className="text-[10px] text-white/20 mt-1.5 text-center">⌘↵ to generate</p>
          </div>

          {/* ── Template Picker ── */}
          <div className="px-4 pt-4 pb-4 border-b border-white/8">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/35 mb-2">Template</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                    template === t.id
                      ? "bg-[#1BB8C9]/15 border border-[#1BB8C9]/40 text-[#1BB8C9]"
                      : "bg-white/4 border border-white/8 text-white/55 hover:bg-white/8 hover:text-white/80"
                  }`}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  <span className="text-xs font-medium leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Fine-tune toggle ── */}
          <div className="px-4 pt-3 pb-1">
            <button
              onClick={() => setShowFineTune((v) => !v)}
              className="flex items-center justify-between w-full text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60 transition-colors py-1"
            >
              <span>Fine-tune tokens</span>
              <span className={`transition-transform ${showFineTune ? "rotate-180" : ""}`}>▾</span>
            </button>
          </div>

          {showFineTune && (
            <div className="px-4 pt-2 pb-4 space-y-3">
              {FINE_TUNE_GROUPS.map((group) => (
                <div key={group.label} className="rounded-lg border border-white/8 overflow-hidden">
                  <button
                    onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-white/3 hover:bg-white/6 transition-colors"
                  >
                    <span className="text-xs font-medium text-white/60">{group.label}</span>
                    <span
                      className={`text-white/30 text-xs transition-transform ${
                        openGroup === group.label ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>

                  {openGroup === group.label && (
                    <div className="px-3 pt-2 pb-3 space-y-2.5 bg-white/2">
                      {group.fields.map((f) => (
                        <div key={f.key}>
                          <label className="block text-[10px] text-white/40 mb-1">{f.label}</label>
                          {f.type === "color" ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={tokens[f.key] ?? "#000000"}
                                onChange={(e) => setToken(f.key, e.target.value)}
                                className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                              />
                              <input
                                type="text"
                                value={tokens[f.key] ?? ""}
                                onChange={(e) => setToken(f.key, e.target.value)}
                                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/75 font-mono focus:outline-none focus:ring-1 focus:ring-[#1BB8C9]"
                              />
                            </div>
                          ) : f.type === "textarea" ? (
                            <textarea
                              value={tokens[f.key] ?? ""}
                              onChange={(e) => setToken(f.key, e.target.value)}
                              rows={3}
                              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/75 resize-none focus:outline-none focus:ring-1 focus:ring-[#1BB8C9]"
                            />
                          ) : (
                            <input
                              type="text"
                              value={tokens[f.key] ?? ""}
                              onChange={(e) => setToken(f.key, e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/75 focus:outline-none focus:ring-1 focus:ring-[#1BB8C9]"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Render button */}
        <div className="px-4 py-4 border-t border-white/8 shrink-0">
          <button
            onClick={() => render(template, tokens)}
            disabled={rendering}
            className="w-full py-2.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-sm font-medium text-white/70 transition-colors"
          >
            {rendering ? "Rendering…" : "Re-render"}
          </button>
        </div>
      </aside>

      {/* ══════════ CANVAS ══════════ */}
      <main className="flex flex-col overflow-hidden bg-[#0d1920]">
        {/* Canvas toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${rendering || aiLoading ? "bg-[#1BB8C9] animate-pulse" : "bg-white/20"}`}
            />
            <span className="text-xs text-white/35">
              {aiLoading ? "AI generating…" : rendering ? "Rendering…" : "600px email canvas"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={!html}
              className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-30 border border-white/10 rounded px-2.5 py-1 hover:border-white/25"
            >
              Export PDF
            </button>
            <button
              onClick={handleCopyHtml}
              disabled={!html}
              className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-30 border border-white/10 rounded px-2.5 py-1 hover:border-white/25"
            >
              {copied ? "Copied ✓" : "Copy HTML"}
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-[660px] mx-auto">
            {html ? (
              <EmailPreviewFrame srcDoc={html} />
            ) : (
              <div className="h-96 rounded-xl border border-white/8 flex flex-col items-center justify-center gap-3">
                <div className="text-2xl opacity-20">✉</div>
                <p className="text-sm text-white/25">
                  Describe your email above, or pick a template to preview
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
