/**
 * The "wow moment" (Task 12): an agent forwards a campaign they sent from their
 * OLD platform to switch@, applies it from a signed-in session, and we hand back
 * the SAME email rebuilt with today's live market data — as a DRAFT they open and
 * edit before anything goes anywhere.
 *
 * TWO parts, split for testability:
 *   - `deriveRebuildPrompt` — PURE. Strips the forwarded campaign HTML to text
 *     (a linear scan, mirroring lib/switch/forward-inbound.ts's `stripTags` — no
 *     backtracking regex over the whole doc), truncates to MAX_CAMPAIGN_TEXT, and
 *     wraps it in an instruction that DEMANDS real data and FORBIDS invention. The
 *     instruction text itself carries no figures — every number must come from the
 *     live build, never from this wrapper.
 *   - `rebuildForwardedCampaign` — orchestration behind injected deps (no DB, no
 *     network in this module). Loads the applied forward row, builds off a
 *     deep-copied `trend-snapshot` seed (THE SLOT RULE: empty fields are open
 *     slots the AI fills with live data), persists the result as a NEW DRAFT
 *     deliverable (the claim-and-send create-new pattern — project + deliverable,
 *     status "ready" = never sent/scheduled), then emails the agent ONE edit link.
 *
 * EDIT-BEFORE-SEND is the trust line: this NEVER sends the rebuilt deliverable and
 * NEVER touches a schedule — it only lands a draft and points the agent at it.
 * Every failure path logs and returns { deliverableId: null }; a failed alert
 * email never loses an already-persisted draft.
 *
 * NO build metering here (Task 8): this is a system-triggered one-off inside an
 * authenticated apply context, not a user-initiated lab build, so the free-tier
 * daily build guard does not apply.
 */
import { seedById } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

/** Hard cap on how much forwarded-campaign text feeds the rebuild prompt — long
 *  enough to carry the agent's topic and voice, short enough to keep the prompt
 *  bounded (inbound mail has no documented size cap; see forward-inbound.ts). */
export const MAX_CAMPAIGN_TEXT = 1500;

/** Nice display names for the platform slugs the classifier emits
 *  (lib/switch/forward-inbound.ts's PLATFORM_MARKERS — one naming authority).
 *  Unknown slugs pass through verbatim rather than being guessed at. */
const PLATFORM_LABELS: Record<string, string> = {
  mailchimp: "Mailchimp",
  constantcontact: "Constant Contact",
  followupboss: "Follow Up Boss",
};

export function platformDisplayName(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/** Linear HTML→text strip (same shape as forward-inbound.ts's `stripTags`): drop
 *  every tag, collapse whitespace, trim. No backtracking over the whole doc. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * PURE. Turn a forwarded campaign's HTML into the rebuild build-prompt: strip to
 * text, truncate to MAX_CAMPAIGN_TEXT, and wrap in the instruction. The wrapper
 * demands a fresh version on live data and forbids carrying stale figures — it
 * states NO number of its own (RULE 0.7: the build sources every figure; this
 * prompt never invents one).
 */
export function deriveRebuildPrompt(campaignText: string, platform: string | null): string {
  const text = stripTags(campaignText).slice(0, MAX_CAMPAIGN_TEXT);
  const platformPhrase = platform ? ` (originally sent from ${platformDisplayName(platform)})` : "";
  return (
    `Rebuild this email the agent sent from their old platform${platformPhrase} as a fresh ` +
    `version with current market data. Keep their topic and intent; replace every stale figure ` +
    `with live data:\n\n${text}`
  );
}

// ── orchestration ─────────────────────────────────────────────────────────────

/** The applied campaign forward, reduced to what the rebuild needs. */
export interface RebuildForwardRow {
  html: string | null;
  platform: string | null;
}

export interface RebuildCampaignDeps {
  log: (line: string) => void;
  /** Site origin (no trailing slash) for the edit link. */
  siteUrl: string;
  /** Load the (applied) campaign forward's html + platform, or null. */
  loadForward: (forwardId: string) => Promise<RebuildForwardRow | null>;
  /** Run the Email Lab content build (wraps `buildContentDoc`). Returns the built
   *  EmailDoc, or null when the build produced no usable doc. */
  buildDoc: (prompt: string, rawDoc: unknown) => Promise<EmailDoc | null>;
  /** Persist the built doc as a NEW DRAFT deliverable (project + deliverable,
   *  service-role — the create-new claim-and-send pattern). Returns the ids, or
   *  null on any write failure. NEVER sends or schedules. */
  persistDraft: (
    userId: string,
    doc: EmailDoc,
    platform: string | null,
  ) => Promise<{ projectId: string; deliverableId: string } | null>;
  /** The agent's real auth email (auth.users.email), or null. */
  getAuthEmail: (userId: string) => Promise<string | null>;
  /** Send ONE short plain-text alert. */
  sendEmail: (to: string, subject: string, body: string) => Promise<void>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Rebuild an applied forwarded campaign as a draft and email the agent one edit
 * link. Best-effort throughout: any miss (no row, no html, build/persist failure)
 * logs and returns { deliverableId: null }; a failed alert never loses the draft
 * that already persisted. NEVER sends the rebuilt deliverable — draft only.
 */
export async function rebuildForwardedCampaign(
  deps: RebuildCampaignDeps,
  userId: string,
  forwardId: string,
): Promise<{ deliverableId: string | null }> {
  try {
    const row = await deps.loadForward(forwardId);
    if (!row || !row.html || row.html.trim().length === 0) {
      deps.log(`[switch] rebuild ${forwardId}: no campaign html to rebuild from — skipping.`);
      return { deliverableId: null };
    }

    const seed = seedById("trend-snapshot");
    if (!seed) {
      deps.log(`[switch] rebuild ${forwardId}: trend-snapshot seed missing — skipping.`);
      return { deliverableId: null };
    }
    // Deep-copied seed: THE SLOT RULE means its empty fields are open slots the
    // build fills with live data; build() already returns a fresh object graph,
    // structuredClone guarantees no shared reference leaks into the draft.
    const rawDoc = structuredClone(seed.build());
    const prompt = deriveRebuildPrompt(row.html, row.platform);

    const doc = await deps.buildDoc(prompt, rawDoc);
    if (!doc) {
      deps.log(`[switch] rebuild ${forwardId}: build produced no doc — skipping.`);
      return { deliverableId: null };
    }

    const persisted = await deps.persistDraft(userId, doc, row.platform);
    if (!persisted) {
      deps.log(`[switch] rebuild ${forwardId}: persist failed — skipping.`);
      return { deliverableId: null };
    }

    // Alert is best-effort and comes AFTER the durable draft: a send failure or a
    // missing auth email must never turn a saved draft into a lost one.
    try {
      const email = await deps.getAuthEmail(userId);
      if (email) {
        const label = row.platform ? ` ${platformDisplayName(row.platform)}` : "";
        const editUrl = `${deps.siteUrl}/project/${persisted.projectId}/email-lab?did=${persisted.deliverableId}`;
        await deps.sendEmail(
          email,
          `Your${label} campaign, rebuilt with today's data`,
          `Your${label} campaign, rebuilt with today's data — open it to edit before it goes anywhere.\n\n${editUrl}`,
        );
      } else {
        deps.log(`[switch] rebuild ${forwardId}: no auth email for ${userId}; alert skipped.`);
      }
    } catch (err) {
      deps.log(`[switch] rebuild ${forwardId}: alert send failed: ${errMsg(err)}`);
    }

    return { deliverableId: persisted.deliverableId };
  } catch (err) {
    deps.log(`[switch] rebuild ${forwardId} failed: ${errMsg(err)}`);
    return { deliverableId: null };
  }
}
