import type { ProjectItem } from "@/lib/project/items";

/**
 * Build a `qa` ProjectItem snapshot for filing into the briefcase.
 *
 * One builder, two "File this answer" surfaces — the standalone analyst chat
 * (`BriefcaseChat`) and the report dock (`AskAiDock`) — so both produce an
 * identical, schema-valid item (validated against `projectItemsSchema`). Stamps
 * the required base fields (`id` / `added_at` / `origin`) and attaches the
 * optional provenance fields only when present (so a filed item never carries
 * `undefined` keys).
 */
export interface QaItemInput {
  report_id: string;
  question: string;
  answer: string;
  freshness_token?: string;
  fact?: string;
  selection_type?: string;
  reach?: string[];
}

export function buildQaItem(input: QaItemInput): ProjectItem {
  const item: Extract<ProjectItem, { kind: "qa" }> = {
    id: crypto.randomUUID(),
    added_at: new Date().toISOString(),
    origin: "web",
    kind: "qa",
    report_id: input.report_id,
    question: input.question,
    answer: input.answer,
  };
  if (input.fact) item.fact = input.fact;
  if (input.selection_type) item.selection_type = input.selection_type;
  if (input.reach && input.reach.length > 0) item.reach = input.reach;
  if (input.freshness_token) item.freshness_token = input.freshness_token;
  return item;
}
