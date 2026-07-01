/**
 * AI project-type inference (Phase 4B.infer).
 *
 * Runs passively on the first event-match attempt when both `project_type` and
 * `derived_project_type` are null. A lightweight Haiku call reads the project name,
 * ZIP, and up to 5 filed item labels and returns one of the types that map to
 * event-radius-config.yaml entries.
 *
 * Result is written to projects.derived_project_type and is not re-run unless the
 * project name/location changes (the caller gates on both type fields being null).
 * If inference fails or the project has too little data, returns null and _default
 * config is used upstream.
 */

import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import type { SupabaseClient } from "@supabase/supabase-js";

const VALID_TYPES = [
  "strip_mall",
  "mixed_use",
  "office",
  "residential_development",
  "industrial",
  "retail_pad",
  "hospitality",
  "healthcare_facility",
  "_default",
] as const;

export type ProjectType = (typeof VALID_TYPES)[number];

const TYPE_DESCRIPTIONS: Record<ProjectType, string> = {
  strip_mall: "strip mall or shopping center with multiple inline tenants",
  mixed_use: "mixed-use development combining residential and retail/office",
  office: "office building or office park",
  residential_development: "residential development, subdivision, or apartment complex",
  industrial: "industrial property, warehouse, distribution center, or flex space",
  retail_pad: "freestanding retail pad site or outparcel",
  hospitality: "hotel, resort, or short-term rental property",
  healthcare_facility: "medical office, hospital, or healthcare facility",
  _default: "general commercial real estate or unknown type",
};

const PROMPT =
  "Classify this real estate project as exactly one of these types based on the project " +
  "name, location, and filed data. Return ONLY the type key — no explanation.\n\n" +
  "Types:\n" +
  Object.entries(TYPE_DESCRIPTIONS)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

/**
 * Infer the project type using Haiku. Returns null on failure (caller uses _default).
 * Writes the result to projects.derived_project_type as a fire-and-forget side effect.
 */
export async function inferProjectType(
  supabase: SupabaseClient,
  project: {
    id: string;
    title: string;
    zip?: string | null;
    place?: string | null;
    itemLabels?: string[];
  },
): Promise<ProjectType | null> {
  try {
    const contextLines = [
      `Project name: "${project.title}"`,
      project.place ? `Location: ${project.place}` : null,
      project.zip ? `ZIP: ${project.zip}` : null,
      project.itemLabels?.length
        ? `Filed data: ${project.itemLabels.slice(0, 5).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const client = getAnthropic("other");
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 32,
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\nProject context:\n${contextLines}`,
        },
      ],
    });

    const raw = ((msg.content[0] as { type?: string; text?: string })?.text ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "");

    const matched = VALID_TYPES.find((t) => t === raw);
    const type: ProjectType = matched ?? "_default";

    // Fire-and-forget write — never block the caller on this
    supabase
      .from("projects")
      .update({ derived_project_type: type })
      .eq("id", project.id)
      .then(({ error }) => {
        if (error) console.error("[infer-project-type] update error:", error.message);
      });

    return type;
  } catch (err) {
    console.error("[infer-project-type] inference failed:", err);
    return null;
  }
}
