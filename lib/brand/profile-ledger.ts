// lib/brand/profile-ledger.ts
//
// THE ONE HAVE/NEED ROOT for the brand profile (spec
// docs/superpowers/specs/2026-07-16-brand-fill-once-design.md §A).
//
// Every surface that wants to know "what brand fields are missing" asks
// profileGaps() — the build popups (both lanes), the Brand panel strip, the
// socials page. Nothing keeps its own list; that is how the surfaces stop
// disagreeing about what has already been answered.
//
// Client-safe: pure data + pure functions, no fs, no server imports.

export type ProfileTier = "must" | "boost" | "nice";

export interface ProfileFieldSpec {
  /** Column key on user_brand_profiles — MUST stay in lockstep with the
   *  allowlists in app/api/user/brand/route.ts (pinned by test). */
  key: string;
  /** Popup-voice label ("your name") — AddressPopup renders it as-is; the
   *  Brand panel strip capitalizes the first letter. */
  label: string;
  tier: ProfileTier;
  /** WHY we ask (NN/g: explain why) — required on must+boost, shown wherever
   *  the field is requested. */
  askCopy?: string;
  /** False = an upload/pick, never a text input in a popup. */
  typable: boolean;
}

const f = (
  key: string,
  label: string,
  tier: ProfileTier,
  askCopy?: string,
  typable = true,
): ProfileFieldSpec => ({ key, label, tier, askCopy, typable });

export const PROFILE_FIELDS: readonly ProfileFieldSpec[] = [
  // ── must — the CAN-SPAM signature block. The ONLY fields a popup may demand.
  f("agent_name", "your name", "must", "Every email you send signs with it."),
  f("brokerage", "your brokerage", "must", "Rides in your signature on every send."),
  f(
    "business_address",
    "your business address",
    "must",
    "The legal footer every marketing email must carry (CAN-SPAM).",
  ),
  // ── boost — asked just-in-time, only when a build prints them.
  f("photo_url", "your headshot", "boost", "Your face in the header builds trust.", false),
  f("agent_title", "your title", "boost", "Sharpens your signature line."),
  f("license", "your license number", "boost", "Shown beside your name where required."),
  f("contact_phone", "your phone number", "boost", "Lets readers reach you in one tap."),
  f("contact_email", "your contact email", "boost", "Where replies land."),
  f("website_url", "your website", "boost", "Where your links point."),
  f("agent_bio", "your bio", "boost", "The story block in agent-forward emails."),
  // ── nice — Brand-panel checklist only; never popped.
  f("nickname", "your nickname", "nice"),
  f("logo_url", "your logo", "nice", undefined, false),
  f("primary_color", "your primary color", "nice"),
  f("accent_color", "your accent color", "nice"),
  f("text_color", "your text color", "nice"),
  f("background_color", "your background color", "nice"),
  f("surface_color", "your surface color", "nice"),
  f("surface_dark_color", "your dark surface color", "nice"),
  f("font_display", "your display font", "nice"),
  f("font_body", "your body font", "nice"),
  f("instagram_url", "your Instagram", "nice"),
  f("facebook_url", "your Facebook", "nice"),
  f("linkedin_url", "your LinkedIn", "nice"),
  f("x_url", "your X profile", "nice"),
  f("tiktok_url", "your TikTok", "nice"),
  f("youtube_url", "your YouTube", "nice"),
  f("pinterest_url", "your Pinterest", "nice"),
  f("threads_url", "your Threads", "nice"),
  f("unsubscribe_url", "your unsubscribe link", "nice"),
  f("preferred_recipe", "your go-to email type", "nice"),
  f("default_photo_ratio", "your photo crop default", "nice"),
];

export const PROFILE_FIELD_KEYS: readonly string[] = PROFILE_FIELDS.map((s) => s.key);

export const MUST_KEYS: readonly string[] = PROFILE_FIELDS.filter((s) => s.tier === "must").map(
  (s) => s.key,
);

/** The account→surface blank-fill set (EmailLabGridShell mount prefill,
 *  ProjectEmailLabClient merge). Everything the profile stores. */
export const PREFILL_KEYS: readonly string[] = PROFILE_FIELD_KEYS;

export function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

const BY_KEY = new Map(PROFILE_FIELDS.map((s) => [s.key, s]));

/** Spec lookup by key — delegates (lib/showcase/recipe.ts) read labels here. */
export function profileFieldSpec(key: string): ProfileFieldSpec | undefined {
  return BY_KEY.get(key);
}

/**
 * The fields still missing from `profile`, registry order. `needs` narrows to
 * those keys (unknown keys ignored — a caller can never make the ledger ask
 * for a field that doesn't exist); omitted = the full checklist.
 */
export function profileGaps(
  profile: Record<string, string | null | undefined>,
  needs?: readonly string[],
): ProfileFieldSpec[] {
  const wanted = needs ? new Set(needs) : null;
  return PROFILE_FIELDS.filter((s) => (!wanted || wanted.has(s.key)) && isBlank(profile[s.key]));
}

/** Gaps a popup can actually collect — drops uploads (headshot, logo). */
export function typableProfileGaps(
  profile: Record<string, string | null | undefined>,
  needs?: readonly string[],
): ProfileFieldSpec[] {
  return profileGaps(profile, needs).filter((s) => s.typable);
}

/** The Brand-panel strip's numbers: how full the profile is, and what's
 *  missing per tier (the arrays hold GAPS, not filled fields). */
export function completenessSummary(profile: Record<string, string | null | undefined>): {
  filled: number;
  total: number;
  must: ProfileFieldSpec[];
  boost: ProfileFieldSpec[];
  nice: ProfileFieldSpec[];
} {
  const gaps = profileGaps(profile);
  return {
    filled: PROFILE_FIELDS.length - gaps.length,
    total: PROFILE_FIELDS.length,
    must: gaps.filter((s) => s.tier === "must"),
    boost: gaps.filter((s) => s.tier === "boost"),
    nice: gaps.filter((s) => s.tier === "nice"),
  };
}
