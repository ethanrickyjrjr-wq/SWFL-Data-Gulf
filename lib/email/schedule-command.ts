/**
 * Pure logic for the AI email-schedule command interface (Unit G).
 *
 * The route (`app/api/email/schedule-command/route.ts`) hands a tenant's
 * natural-language command to Claude with a FORCED tool call; the model returns
 * one structured action. Everything in this file is deterministic and has no I/O —
 * the tool schema, the system prompt, the defense-in-depth validation (never trust
 * the model's params), and the human-readable confirmation summary — so it is fully
 * unit-testable without the model or a DB.
 *
 * Two-step contract: the route PROPOSES (parse → validate → summary, no write) and
 * the user CONFIRMS before any row is written. No silent mutations.
 */

import { z } from "zod";
import type { Cadence } from "./schedule-cadence";

export const SCHEDULE_ACTIONS = [
  "create",
  "pause",
  "stop",
  "change-template",
  "change-cadence",
  "change-audience",
] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/**
 * Forced-tool JSON schema handed to Claude. Only `action` is required; the model
 * fills only the params relevant to the action it picks. `additionalProperties:
 * false` so the model can't smuggle in unknown fields.
 */
export const SCHEDULE_COMMAND_TOOL = {
  name: "propose_email_schedule_action",
  description:
    "Translate the user's natural-language email-schedule command into exactly ONE structured action. Fill only the parameters relevant to the chosen action.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: [...SCHEDULE_ACTIONS] },
      schedule_id: {
        type: "integer",
        description:
          "Target schedule id for pause / stop / change-* — copy it from the EXISTING SCHEDULES list. Omit for create.",
      },
      cadence: { type: "string", enum: ["daily", "weekly", "monthly"] },
      day_of_week: { type: "integer", description: "0 = Sunday … 6 = Saturday. Weekly only." },
      day_of_month: { type: "integer", description: "1–28. Monthly only." },
      send_hour_et: { type: "integer", description: "Send hour in US Eastern time, 0–23." },
      audience_slug: {
        type: "string",
        description:
          "Audience to send to. Only if named by the user or present on an existing schedule.",
      },
      template_id: {
        type: "string",
        description:
          "Template to use. Only if named by the user or present on an existing schedule.",
      },
    },
    required: ["action"],
  },
};

export interface ExistingSchedule {
  id: number;
  status: string;
  cadence: string | null;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number | null;
  audience_slug: string | null;
  template_id: string | null;
}

export interface ParsedCommand {
  action: ScheduleAction;
  schedule_id?: number;
  cadence?: Cadence;
  day_of_week?: number;
  day_of_month?: number;
  send_hour_et?: number;
  audience_slug?: string;
  template_id?: string;
}

/** System prompt: the 6 intents, the ET-hour rule, and the tenant's existing rows
 *  so the model can target a mutation by `schedule_id`. */
export function buildSystemPrompt(existing: ExistingSchedule[]): string {
  return [
    "You convert a tenant's natural-language request into ONE email-schedule action via the propose_email_schedule_action tool.",
    "Actions: create (a new schedule), pause, stop, change-template, change-cadence, change-audience.",
    "Rules:",
    "- send_hour_et is the hour in US Eastern time, 0–23. Convert '7am' -> 7, '5pm' -> 17, 'noon' -> 12, 'midnight' -> 0.",
    "- weekly needs day_of_week (0 = Sunday … 6 = Saturday). monthly needs day_of_month (1–28).",
    "- For pause / stop / change-*, set schedule_id to the matching row from EXISTING SCHEDULES. If none clearly matches, still pick the closest action and omit schedule_id — a confirmation step follows.",
    "- Never invent an audience_slug or template_id. Use only a value the user named or one already present on an existing schedule.",
    "EXISTING SCHEDULES (JSON):",
    JSON.stringify(existing),
  ].join("\n");
}

// ── primitive field schemas ──────────────────────────────────────────────────
const hourSchema = z.number().int().min(0).max(23);
const dowSchema = z.number().int().min(0).max(6);
const domSchema = z.number().int().min(1).max(28);
const cadenceSchema = z.enum(["daily", "weekly", "monthly"]);

const rawSchema = z.object({
  action: z.enum(SCHEDULE_ACTIONS),
  schedule_id: z.number().int().positive().optional(),
  cadence: cadenceSchema.optional(),
  day_of_week: dowSchema.optional(),
  day_of_month: domSchema.optional(),
  send_hour_et: hourSchema.optional(),
  audience_slug: z.string().min(1).optional(),
  template_id: z.string().min(1).optional(),
});

export type ValidationResult =
  | { ok: true; command: ParsedCommand }
  | { ok: false; errors: string[] };

/**
 * Defense-in-depth validation of a tool-call input (or a confirm-step proposal).
 * Validates primitive field shapes via zod, then the per-action cross-field
 * requirements. Used on BOTH the parsed model output (after the route merges
 * existing-row defaults) and the client's confirm payload — never trust either.
 */
export function validateToolInput(input: unknown): ValidationResult {
  const parsed = rawSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const c = parsed.data as ParsedCommand;
  const errors: string[] = [];

  const requireCadence = () => {
    if (!c.cadence) {
      errors.push("cadence is required (daily | weekly | monthly)");
      return;
    }
    if (c.cadence === "weekly" && c.day_of_week == null)
      errors.push("weekly schedule requires day_of_week (0 = Sunday … 6 = Saturday)");
    if (c.cadence === "monthly" && c.day_of_month == null)
      errors.push("monthly schedule requires day_of_month (1–28)");
  };

  switch (c.action) {
    case "create":
      requireCadence();
      if (c.send_hour_et == null) errors.push("send_hour_et is required");
      break;
    case "change-cadence":
      requireCadence();
      // send_hour_et is filled from the existing row by the route before validation.
      if (c.send_hour_et == null) errors.push("send_hour_et is required for change-cadence");
      break;
    case "change-template":
      if (!c.template_id) errors.push("change-template requires template_id");
      break;
    case "change-audience":
      if (!c.audience_slug) errors.push("change-audience requires audience_slug");
      break;
    case "pause":
    case "stop":
      // schedule_id is resolved by the route (explicit, or inferred when the tenant
      // has exactly one schedule); not a hard param requirement here.
      break;
  }
  return errors.length ? { ok: false, errors } : { ok: true, command: c };
}

function fmtHour(h?: number): string {
  if (h == null) return "?";
  const isAm = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${isAm ? "am" : "pm"}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Plain-English confirmation line shown to the tenant before they confirm. */
export function summarizeCommand(c: ParsedCommand): string {
  const when = (): string => {
    if (c.cadence === "daily") return `every day at ${fmtHour(c.send_hour_et)} ET`;
    if (c.cadence === "weekly")
      return `every ${WEEKDAYS[c.day_of_week ?? 0]} at ${fmtHour(c.send_hour_et)} ET`;
    if (c.cadence === "monthly")
      return `on day ${c.day_of_month} of each month at ${fmtHour(c.send_hour_et)} ET`;
    return "";
  };
  const to = c.audience_slug ? ` to "${c.audience_slug}"` : "";
  const tmpl = c.template_id ? ` using template "${c.template_id}"` : "";
  switch (c.action) {
    case "create":
      return `Create a ${c.cadence} schedule that sends ${when()}${to}${tmpl}.`;
    case "pause":
      return `Pause schedule #${c.schedule_id ?? "?"}.`;
    case "stop":
      return `Stop schedule #${c.schedule_id ?? "?"} (it will no longer send).`;
    case "change-template":
      return `Change schedule #${c.schedule_id ?? "?"} to use template "${c.template_id}".`;
    case "change-cadence":
      return `Change schedule #${c.schedule_id ?? "?"} to send ${when()}.`;
    case "change-audience":
      return `Change schedule #${c.schedule_id ?? "?"} to send to audience "${c.audience_slug}".`;
  }
}

/** Short human description of an existing schedule, for clarification candidates. */
export function describeExisting(s: ExistingSchedule): string {
  const cad =
    s.cadence === "weekly"
      ? `weekly (${WEEKDAYS[s.day_of_week ?? 0]})`
      : s.cadence === "monthly"
        ? `monthly (day ${s.day_of_month})`
        : (s.cadence ?? "—");
  return `${cad} at ${fmtHour(s.send_hour_et ?? undefined)} ET → ${s.audience_slug ?? "no audience"} [${s.status}]`;
}
