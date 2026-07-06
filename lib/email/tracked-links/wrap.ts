/**
 * Rewrite a known link in rendered email HTML to a signed, self-describing
 * `${origin}/api/r/<token>` tracked link. Pure — no I/O, returns a NEW string.
 *
 * This is the send-side half of link-click routing. It runs where the per-recipient
 * context actually exists — the send path (`buildBatchMessages`), which already knows
 * each recipient's `rid` and rewrites the unsubscribe placeholder the same way — NOT
 * at compose time, where `rid`/`campaign_id`/`step` aren't yet joined to the message.
 *
 * Deliberately NOT a "walk every block" transform: the outreach drip renders HTML from
 * a token template (no EmailDoc block tree), so the single CTA URL is rewritten by
 * exact string match. Call it once per link to wrap N links (only the CTA exists in the
 * live drip today; multi-button transactional emails call it per button).
 *
 * Env-gated: no signing secret → the raw link ships untracked rather than broken.
 */
import { signLinkToken, type LinkContext } from "./token";
import type { ComposedMessage } from "../outreach/campaign";

export interface WrapResult {
  /** The HTML with the destination rewritten (or unchanged when nothing was wrapped). */
  html: string;
  /** The minted token, or null when nothing was wrapped (dest absent, empty, or no secret). */
  token: string | null;
}

/** `&`-escape a URL so we also catch the form an HTML renderer may have emitted. */
function ampEscaped(url: string): string {
  return url.replace(/&/g, "&amp;");
}

/**
 * Replace every occurrence of `dest` (raw and `&amp;`-escaped) in `html` with a tracked
 * link. Returns the rewritten html + the token (null ⇒ nothing wrapped, so the caller
 * emits no `sent` row). A `token != null` result means exactly one link was wrapped.
 */
export function wrapTrackedLink(
  html: string,
  dest: string,
  ctx: LinkContext,
  origin: string,
): WrapResult {
  if (!dest) return { html, token: null };
  const ampDest = ampEscaped(dest);
  const present = html.includes(dest) || (ampDest !== dest && html.includes(ampDest));
  if (!present) return { html, token: null };

  const token = signLinkToken(dest, ctx);
  if (!token) return { html, token: null }; // no secret → ship the raw link untracked

  const tracked = `${origin.replace(/\/$/, "")}/api/r/${token}`;
  let out = html.split(dest).join(tracked);
  if (ampDest !== dest) out = out.split(ampDest).join(tracked);
  return { html: out, token };
}

/** One `sent` inventory row — the link was minted, so it counts toward the CTR denominator. */
export interface MintedSent {
  rid: string;
  cid: string | null;
  step: number | null;
  bk: string;
  dest: string;
  ch: "email";
}

export interface CampaignWrapOptions {
  /** Absolute site origin the `/api/r/` links are built against. */
  origin: string;
  /** Map a message → its outreach_recipients.id (the same seam send.ts uses for `rid`). */
  recipientId: (m: ComposedMessage) => string;
  /** Map a message → campaign_id, or null. Optional. */
  campaignId?: (m: ComposedMessage) => string | null;
  /** Map a message → drip step at mint time, or null. Optional. */
  step?: (m: ComposedMessage) => number | null;
}

export interface CampaignWrapResult {
  /** The same messages, with each ready message's CTA rewritten to a tracked link. */
  messages: ComposedMessage[];
  /** One `sent` row per link actually wrapped (drives clicks ÷ links-sent CTR). */
  minted: MintedSent[];
}

/**
 * Wrap the CTA link in every ready campaign message and collect the `sent` inventory.
 * The single reusable adoption seam (design decision 6): a runner calls this on its
 * ready messages before `buildBatchMessages`, logs the returned `minted` rows as `sent`
 * events (fire-and-forget), and sends the rewritten HTML. Unsubscribe is deliberately
 * NOT wrapped — it already routes through our own `/api/unsubscribe` with a one-click
 * `List-Unsubscribe` header (send.ts); re-wrapping it would add a failure hop to the
 * compliance-critical opt-out path.
 *
 * Non-ready messages (no html / no arrivalUrl) pass through untouched. Env-gated: with
 * no signing secret, messages are unchanged and `minted` is empty — the send still goes
 * out, just untracked.
 */
export function wrapCampaignLinks(
  messages: ComposedMessage[],
  opts: CampaignWrapOptions,
): CampaignWrapResult {
  const minted: MintedSent[] = [];
  const out = messages.map((m) => {
    if (m.status !== "ready" || !m.html || !m.arrivalUrl) return m;
    const ctx: LinkContext = {
      rid: opts.recipientId(m),
      cid: opts.campaignId?.(m) ?? null,
      step: opts.step?.(m) ?? null,
      bk: "cta",
      ch: "email",
    };
    const wrapped = wrapTrackedLink(m.html, m.arrivalUrl, ctx, opts.origin);
    if (!wrapped.token) return m; // nothing wrapped (dest absent or no secret)
    minted.push({ ...ctx, dest: m.arrivalUrl });
    return { ...m, html: wrapped.html };
  });
  return { messages: out, minted };
}
