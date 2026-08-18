/**
 * THE BUILD-TIME EMAIL AI'S GROUNDING — ONE AI, TWO FEEDS.
 *
 * Plan: `docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` §4 Step 3,
 * operator-chosen architecture ("make it happen", 08/12/2026). This is NOT a merge of the
 * two AI products and must never become one: PROJECT AI streams prose, the email builder
 * emits a schema-validated EmailDoc. What is shared is what they KNOW, never what they emit.
 *
 * WHY IT EXISTS. `app/api/email-lab/ai/route.ts` parsed only prompt/doc/scope/mode/recipeKey.
 * It already knew WHICH email it was editing (`recipeKey`, 5 references) and was never told
 * that recipe's rules or the project it lives in — so "why don't I have X?" had nothing to
 * answer from. Measured default for that situation is confabulation, not abstention
 * (Sufficient Context, arXiv:2411.06037 — a strong model "often outputs incorrect answers
 * instead of abstaining when the context is not sufficient").
 *
 * WHERE IT LANDS IN THE PIPE: stop (2.5), "AI FILLS OPEN SLOTS — prose only" (playbook
 * PART 0). This changes what that model KNOWS. It must never change what it is allowed to
 * emit: it still writes prose, never a figure, never a cell, never a position (§1.14).
 *
 * TWO RULES THIS FILE OBEYS, both learned the hard way:
 *
 * 1. **PROJECT, THEN INJECT.** Chat does not hand the model the rich `ProjectDigest`; it
 *    projects to a compact shape and slices its lists to 3 (`lib/chat/page-context.ts:202`).
 *    Context is "a finite resource with diminishing marginal returns" subject to context rot
 *    (Anthropic, effective-context-engineering). Copy the projection — do not bypass it.
 * 2. **DERIVE, NEVER RETYPE.** Every constraint below is read from its code root AT REQUEST
 *    TIME (`lengthProfile`, the recipe registry). A number typed into a prompt string is a
 *    number that drifts silently from the code that enforces it — the exact failure
 *    `lib/narratives/length.ts` exists to end.
 *
 * WHO SENDS `projectId` TODAY — declared, not hidden. All four browser call sites in
 * `EmailLabGridShell.tsx` do. The two SERVER-TO-SERVER callers do NOT:
 * `app/api/projects/[id]/ai-material/route.ts:50` and
 * `app/api/projects/[id]/materials/[did]/refresh/route.ts:52`. Both sit under `/projects/[id]`
 * and therefore KNOW the id, so wiring them looks trivial — it is not. Their inner fetch
 * carries no cookie, so `loadProjectFeed`'s RLS read would find no session; forwarding the
 * cookie to fix that would ALSO hand the request to `meterUserId`, and since neither sends
 * `build: true` they would start consuming the user's free daily build allowance and could
 * begin 429-ing scheduled refreshes. That is a real behaviour change, not a wiring gap, so
 * it is left for an explicit decision. Today those two builds degrade HONESTLY: the prefix
 * states "PROJECT: none" rather than describing a project it cannot see.
 */
import { recipeByKey } from "@/lib/deliverable/recipes";
import { lengthProfile } from "@/lib/narratives/length";
import type { ProjectDigest } from "@/lib/project/digest";

/** How many list entries survive the projection. Chat slices to 3; match it. */
const LIST_SLICE = 3;

/** Bound every user-controlled string fed into a system prompt — the same treatment
 *  `other-projects.ts:68` already gives a project title, for the same reason: a title,
 *  an activity line and a change line are all typed by a user, and an unbounded one
 *  both rots the context window and hands the prompt a paragraph-length lever. */
const TITLE_MAX = 60;
const LINE_MAX = 100;
function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** FEED 1 — the project, projected. Never the raw digest. */
export interface ProjectFeed {
  projectId: string;
  title: string;
  scope?: string;
  itemCount: number;
  /** UNDEFINED means "the caller did not load schedules" — NOT "there are none".
   *  A prefix whose job is to stop confabulation may not itself assert an absence it
   *  never checked: `email_schedules` is a separate table, the route does not read it,
   *  and printing "no email schedule" for a project that has one is the same defect
   *  this file exists to prevent (2 live projects carry a schedule, measured
   *  08/12/2026). Only stated when genuinely known. */
  hasEmailSchedule?: boolean;
  recentActivity?: string[];
  significantChanges?: string[];
}

/** FEED 2 — this deliverable's own rules, derived from code roots. */
export interface RecipeFeed {
  key: string;
  label: string;
  /** "sell-side" pitches a specific property or the agent's brand; "story-side" does not. */
  positioning: string;
  /** What the recipe resolves its content around — an address, an area, the agent. */
  subject: string;
  /** Verbatim from `lengthProfile("area-email")` — the band the validator also judges by. */
  lengthInstruction: string;
  /** Whether this recipe carries a chart at all. Twelve of seventeen are `none`, and none
   *  means DROP the slot — an empty chart box is worse than no chart (playbook DIAL 2). */
  chartPolicy: string;
}

/**
 * FEED 1'S GUARD — the one most likely to ship silently.
 *
 * The context bus (`lib/project/ai-context-store.ts`) is a MODULE-LEVEL store that survives
 * route changes, so it can still hold project A's digest while the user is already building
 * inside project B. Chat defends this by comparing the digest against the project named in
 * the PATH. The email lab's path may not name a project at all, so that trick does not
 * transfer: the caller must state which project this build belongs to, explicitly.
 *
 * Hence the shape — an explicit `requestedProjectId`, and a hard refusal on mismatch. An
 * absent id means NO project context, never "whatever was open last". Getting this wrong
 * does not throw and does not look broken; it makes the AI confidently describe the wrong
 * project's data, which is why it is the first thing tested.
 */
export function projectFeedFor(
  requestedProjectId: string | null | undefined,
  digest: ProjectDigest | null | undefined,
  /** WHICH INPUTS THE CALLER ACTUALLY LOADED. `buildProjectDigest` DEFAULTS `schedules`
   *  to `[]` (digest.ts:306), so an empty array is indistinguishable from "never
   *  fetched" once it is inside the digest — reading `.length` there answers a question
   *  the data cannot answer. The caller is the only one who knows, so the caller says.
   *  Omitted = not loaded = the prefix stays silent about schedules. */
  loaded?: { schedules?: boolean },
): ProjectFeed | null {
  if (!requestedProjectId || !digest) return null;
  if (digest.projectId !== requestedProjectId) return null;
  // The digest's scope is an INFERRED shape (zip / place / topic / address), not a
  // kind+value pair — read its real fields rather than inventing a grain it does not
  // carry. `address` is populated only when the caller passes `subjectAddress`
  // (digest.ts:120 -> inferScopeFromSubject); a caller that omits it gets no address
  // here, which is precisely the listing-project blind spot recorded as
  // `listing_scope_not_in_digest`. Precedence is the digest's own: items -> subject.
  const s = digest.scope;
  const scope =
    [s?.address, s?.place, s?.zip, s?.topic].find((v) => typeof v === "string" && v) ?? undefined;
  return {
    projectId: digest.projectId,
    title: clip(digest.title ?? "", TITLE_MAX),
    scope,
    itemCount: digest.itemCount,
    hasEmailSchedule: loaded?.schedules ? (digest.schedules?.length ?? 0) > 0 : undefined,
    recentActivity: digest.recentActivity?.length
      ? digest.recentActivity.slice(0, LIST_SLICE).map((s) => clip(String(s), LINE_MAX))
      : undefined,
    // SignificantChange is an OBJECT (lib/signals/types.ts:33) — `String(c)` yields
    // "[object Object]", which would have shipped a literal that string into a system
    // prompt the moment a caller started passing them. Render the two fields a writer
    // can actually use: what moved, and by how much.
    significantChanges: digest.significantChanges?.length
      ? digest.significantChanges
          .slice(0, LIST_SLICE)
          .map((c) => clip(`${c.label}: ${c.delta_description}`.trim(), LINE_MAX))
      : undefined,
  };
}

/**
 * FEED 2 — resolve a recipe key to the constraints that govern THIS deliverable.
 *
 * Returns null (not a half-filled object) for an unknown or stale key, so a caller can tell
 * "no recipe" from "a recipe grounded in nothing" — a resolver that silently returns empty
 * leaves an AI that is ungrounded while APPEARING grounded, which is worse than no grounding.
 */
export function recipeFeed(recipeKey: string | null | undefined): RecipeFeed | null {
  const recipe = recipeByKey(recipeKey);
  if (!recipe) return null;
  return {
    key: recipe.key,
    label: recipe.label,
    positioning: recipe.positioning,
    subject: String(recipe.subject),
    // DERIVED, never retyped — the same root the narrative validator judges against.
    lengthInstruction: lengthProfile("area-email").instruction,
    chartPolicy: String(recipe.chart),
  };
}

function projectSection(project: ProjectFeed | null): string {
  if (!project) {
    // STATED, not omitted. A silently missing section reads to the model as "nothing worth
    // saying about the project"; this reads as "you do not have it" — which is the truth,
    // and the difference between abstaining and confabulating.
    // WORDED AS A FACT ABOUT WHAT WE WERE GIVEN, NOT ABOUT WHAT EXISTS. The earlier
    // wording ("this build is not attached to a project") is FALSE for the two callers
    // under /api/projects/[id]/... — they are inside a project and simply do not send
    // the id. Asserting a state of the world we never checked is the exact defect this
    // prefix exists to prevent, so it speaks only about its own inputs.
    return `PROJECT: not provided with this build. You do NOT have the user's project items, schedules, or history — do not describe them, and do not claim the build has no project.`;
  }
  const bits = [
    `PROJECT: "${project.title}"`,
    project.scope ? `scope ${project.scope}` : null,
    `${project.itemCount} filed item(s)`,
    // Tri-state on purpose: absent = not loaded = say nothing.
    project.hasEmailSchedule === undefined
      ? null
      : project.hasEmailSchedule
        ? "has a running email schedule"
        : "no email schedule",
  ].filter(Boolean);
  const lines = [bits.join(" · ")];
  if (project.significantChanges?.length)
    lines.push(`Recent changes: ${project.significantChanges.join("; ")}`);
  if (project.recentActivity?.length)
    lines.push(`Recent activity: ${project.recentActivity.join("; ")}`);
  return lines.join("\n");
}

function recipeSection(recipe: RecipeFeed | null): string {
  if (!recipe) {
    return `DELIVERABLE: not identified — no recipe key was carried on this request. Answer about the document in front of you only; do not assert rules for a deliverable type you cannot name.`;
  }
  return [
    `DELIVERABLE: ${recipe.label} (${recipe.positioning}, subject: ${recipe.subject})`,
    `Body length for this surface: ${recipe.lengthInstruction}`,
    `Chart policy: ${recipe.chartPolicy}`,
  ].join("\n");
}

/**
 * The composed system prefix, PREPENDED to the writer instructions.
 *
 * NOTE ON CACHING, because the first version of this comment had it backwards: there is
 * NO `cache_control` breakpoint on this call today (`rg cache_control lib/email/build-doc.ts`
 * = 0 hits), so "placed first so a breakpoint can sit behind it" bought nothing. And if one
 * is ever added, placing PER-PROJECT content first is actively wrong — it would turn a
 * system prompt that is identical across all callers into one that varies per project,
 * collapsing cache hits from all-callers to per-project. Contrast `lib/email/author-doc.ts:126`,
 * which caches precisely because its block carries "no per-request content". If caching is
 * wired here, the stable writer instructions go FIRST behind the breakpoint and this
 * volatile prefix goes AFTER it.
 */
export function buildGroundingPrefix({
  project,
  recipe,
}: {
  project: ProjectFeed | null;
  recipe: RecipeFeed | null;
}): string {
  return `WHAT YOU ARE WORKING ON — grounding, not content. Never copy these lines into the email.

${projectSection(project)}

${recipeSection(recipe)}

WHEN YOU DO NOT HOLD SOMETHING. If the user asks why a figure, photo, or field is missing, or asks for something this deliverable does not carry: say "I don't have that" plainly, name what it would take to get it (paste the listing link, fill it in Branding, type the figure in), and stop. Never invent a number, a date, a feature, or a reason. A cell nobody can source is an OPEN SLOT — visible to the user, absent from the sent email — and an open slot always beats an invented number and always beats a bad link. It is the designed state, not a failure.`;
}
