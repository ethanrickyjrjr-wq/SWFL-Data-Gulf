// lib/email/insiders/author.ts — the ONLY model stage in the insiders pipeline.
//
// Two passes max (draft → editor), ONE IssueBudget ledger, hard abort BETWEEN
// passes on cap breach (never mid-stream, never silent). Mock mode (no key, or
// INSIDERS_LIVE_AUTHOR != "1") returns the deterministic fixture so the DRY_RUN
// pipeline is exercised end-to-end for $0 (weekly-read precedent).
//
// Vendor surface (verified 07/10/2026 via the claude-api skill reference +
// installed SDK 0.106.0 types):
//   • model "claude-fable-5" — thinking always on, so the `thinking` param is
//     OMITTED (an explicit config 400s); depth rides output_config.effort.
//   • server-side refusal fallback: betas ["server-side-fallback-2026-06-01"] +
//     fallbacks [{model: "claude-opus-4-8"}] on the BETA messages surface —
//     which getAnthropic() wraps, so the spend guard + usage log still apply.
//   • structured outputs: output_config.format {type: "json_schema"}.
//   • stop_reason "refusal" on the FINAL response = the whole chain refused.

import { agentsAreMocked, getAnthropic } from "@/refinery/agents/anthropic.mts";
import { IssueBudget, type LedgerEntry } from "./budget";
import type { IssueDossier } from "./dossier";
import { FIXTURE_ISSUE_DOC, ISSUE_DOC_JSON_SCHEMA, IssueDocSchema, type IssueDoc } from "./schema";

const FABLE = "claude-fable-5";
const BETAS = ["server-side-fallback-2026-06-01"];
const FALLBACKS = [{ model: "claude-opus-4-8" }];
const MAX_OUTPUT_TOKENS = 64_000;

export interface AuthorOpts {
  capUsd?: number; // default INSIDERS_MAX_SPEND_USD ?? 20 (operator ruling 07/10/2026)
  effort?: string; // default INSIDERS_EFFORT ?? "xhigh" ("max" is the operator's dial)
  singlePass?: boolean; // default INSIDERS_SINGLE_PASS === "1"
}

export interface AuthorResult {
  doc: IssueDoc;
  ledger: LedgerEntry[];
  passes: Array<"draft" | "editor">;
  servedBy: string[]; // model that produced each pass ("mock" in mock mode)
}

/** The belt on top of the key: paid authoring needs BOTH a real client AND the
 *  explicit flag — a key sitting in env can never spend by accident. */
export function liveAuthoringEnabled(
  env: NodeJS.ProcessEnv = process.env,
  mocked: boolean = agentsAreMocked(),
): boolean {
  return !mocked && env.INSIDERS_LIVE_AUTHOR === "1";
}

/** Pre-pass cost estimate for assertRoom — a LABELED estimate, not a measurement:
 *  chars/4 ≈ input tokens at $10/MTok, plus the full 40K-token output budget at
 *  $50/MTok (conservative: caching makes real pass-2 input cheaper). */
export function estimatePassUsd(promptChars: number): number {
  return (promptChars / 4 / 1_000_000) * 10 + (40_000 / 1_000_000) * 50;
}

// ── Prompts ───────────────────────────────────────────────────────────────────
// STANDING_RULES + the dossier form the STABLE system prefix (dossier block
// carries cache_control so the editor pass reads it at ~10% rate). Only the user
// charge differs between passes.

const STANDING_RULES = `You are the author of the Insiders Edition — SWFL Data Gulf's flagship monthly briefing on Southwest Florida real estate. You write for smart readers who want the month explained, not summarized: educate and predict.

THE SKELETON (fixed, in this order):
1. the_read — your lead thesis for the month. Opinion and voice are yours; numbers are not.
2. stories — the month's biggest news events. Each: what happened (cite [n]) → what the data in the DOSSIER says about that exact area → the analog: where this pattern played out before, anywhere, with [n]-cited figures.
3. dashboard — chart REQUESTS only: plain-language series asks (e.g. "permits YoY by ZIP for Lee County"). Pick the series that tell the month's story. You never supply chart data.
4. forward_look — projections. Each carries base_source_n (the source holding its audited base value) and a falsifier ("this call dies if X").
5. sources — every [n] you cited, with real URLs from the DOSSIER.

THE RULES (non-negotiable):
- Every figure you state must appear VERBATIM in the DOSSIER and carry a [n] reference. If the dossier doesn't hold a number, write the point without a number — never invent, never round, never back-solve.
- Voice: plain language. No system nouns (never "brain", "pack", "master", "pipeline", "dossier" in reader-facing prose). No jargon. No hedge-wrapping of hard numbers.
- Echo the given as-of date into as_of exactly; do not restate dates in prose.
- Emit ONLY the IssueDoc JSON.`;

export function renderDossier(d: IssueDossier): string {
  const news = d.news
    .map((n) => {
      const desk = n.deskWeight
        ? ` [DESK PICK w=${n.deskWeight}${n.areas?.length ? ` areas=${n.areas.join(",")}` : ""}${n.seriesHint ? ` series=${n.seriesHint}` : ""} — ${n.deskWhy}]`
        : "";
      return `• ${n.headline} (${n.sourceName ?? "source"}, ${n.publishedAt}) ${n.url}${desk}\n  ${n.summary}`;
    })
    .join("\n");
  const brains = d.brainOutputs.map((b) => `[${b.slug}]\n${b.outputMd}`).join("\n\n");
  return `AS-OF DATE: ${d.asOf}
ISSUE MONTH: ${d.month}

=== THE SYNTHESIS READ (current direction call) ===
${d.masterOutputMd || "(unavailable this month)"}

=== HELD DATA (per-area outputs; every number here is citable) ===
${brains || "(none)"}

=== THE MONTH'S NEWS (desk picks first; weight 5 = biggest) ===
${news || "(quiet month)"}

=== CHART MENU (series known to be chartable; prefer these in dashboard) ===
${d.chartMenu.map((q) => `• ${q}`).join("\n")}

=== EDITORIAL PLAYBOOK (craft accumulated from past issues) ===
${d.playbookMd || "(first issue — no playbook yet)"}`;
}

function draftCharge(month: string): string {
  return `Author the ${month} issue now, per the skeleton and rules. Counts for a monthly issue: the_read ≥ 2 paragraphs, 2–4 stories, 3–6 dashboard requests, 2–5 forward_look projections. issue_slug is exactly "${month}".`;
}

function editorCharge(draft: IssueDoc): string {
  return `You are now the editor of your own draft. Tighten the thesis until every story serves it; kill any story or analog that doesn't earn its figures; sharpen every falsifier until it names a concrete observable; keep every citation honest against the DOSSIER (a figure without a dossier match must be cut, not kept). Improve the prose — clearer, warmer, zero filler. Emit the FULL corrected IssueDoc JSON (same skeleton, same rules, issue_slug unchanged).

YOUR DRAFT:
${JSON.stringify(draft)}`;
}

// ── The stage ─────────────────────────────────────────────────────────────────

export async function authorIssue(
  dossier: IssueDossier,
  opts: AuthorOpts = {},
): Promise<AuthorResult> {
  if (!liveAuthoringEnabled())
    return {
      doc: FIXTURE_ISSUE_DOC(dossier),
      ledger: [],
      passes: ["draft"],
      servedBy: ["mock"],
    };

  const budget = new IssueBudget(opts.capUsd ?? Number(process.env.INSIDERS_MAX_SPEND_USD ?? 20));
  const effort = opts.effort ?? process.env.INSIDERS_EFFORT ?? "xhigh";
  const singlePass = opts.singlePass ?? process.env.INSIDERS_SINGLE_PASS === "1";
  const client = getAnthropic("insiders_author");

  const system = [
    { type: "text" as const, text: STANDING_RULES },
    {
      type: "text" as const,
      text: renderDossier(dossier),
      cache_control: { type: "ephemeral" as const },
    },
  ];
  const systemChars = STANDING_RULES.length + system[1].text.length;

  const runPass = async (
    pass: "draft" | "editor",
    userText: string,
  ): Promise<{ doc: IssueDoc; model: string }> => {
    budget.assertRoom(estimatePassUsd(systemChars + userText.length));
    const stream = client.beta.messages.stream({
      model: FABLE,
      max_tokens: MAX_OUTPUT_TOKENS,
      betas: BETAS,
      fallbacks: FALLBACKS,
      output_config: {
        effort,
        format: { type: "json_schema", schema: ISSUE_DOC_JSON_SCHEMA },
      },
      system,
      messages: [{ role: "user", content: userText }],
    } as Parameters<typeof client.beta.messages.stream>[0]);
    const msg = await stream.finalMessage();
    budget.record(pass, msg.model, msg.usage);
    if (msg.stop_reason === "refusal")
      throw new Error(
        `[insiders-author] ${pass}: the whole fallback chain refused — aborting (spec: never ship a partial).`,
      );
    if (msg.stop_reason === "max_tokens")
      throw new Error(`[insiders-author] ${pass}: output truncated at max_tokens — aborting.`);
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    let parsed: ReturnType<typeof IssueDocSchema.safeParse>;
    try {
      parsed = IssueDocSchema.safeParse(JSON.parse(text));
    } catch (e) {
      throw new Error(
        `[insiders-author] ${pass}: response is not JSON — aborting. ${e instanceof Error ? e.message : e}`,
      );
    }
    if (!parsed.success)
      throw new Error(
        `[insiders-author] ${pass}: schema parse miss — aborting. ${parsed.error.message.slice(0, 400)}`,
      );
    return { doc: parsed.data, model: msg.model };
  };

  const passes: Array<"draft" | "editor"> = [];
  const servedBy: string[] = [];

  const draft = await runPass("draft", draftCharge(dossier.month));
  passes.push("draft");
  servedBy.push(draft.model);
  let doc = draft.doc;

  if (!singlePass) {
    try {
      const edited = await runPass("editor", editorCharge(doc));
      passes.push("editor");
      servedBy.push(edited.model);
      doc = edited.doc;
    } catch (e) {
      // Editor-pass budget breach / refusal / parse miss → ship the DRAFT (it
      // already parsed); a draft in hand beats an aborted issue. Draft-pass
      // failures above still abort hard.
      console.error(
        `[insiders-author] editor pass skipped — shipping the draft: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  return { doc, ledger: budget.entries, passes, servedBy };
}
