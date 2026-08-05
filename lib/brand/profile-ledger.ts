// lib/brand/profile-ledger.ts
//
// THE ONE HAVE/NEED ROOT for the brand profile (spec
// docs/superpowers/specs/2026-07-16-brand-fill-once-design.md §A, extended by
// docs/superpowers/specs/2026-08-05-brand-field-registry-authority-design.md).
//
// Every surface that wants to know "what brand fields are missing" asks
// profileGaps() — the build popups (both lanes), the Brand panel strip, the
// socials page. Nothing keeps its own list; that is how the surfaces stop
// disagreeing about what has already been answered.
//
// ── WHAT THIS REGISTRY GOVERNS, AND WHAT IT MUST NEVER GOVERN ───────────────
// It governs THREE things: the account PATCH allowlist, which inputs the Brand
// panel renders, and the account→project carry set.
//
// It NEVER validates `projects.branding` or deliverable branding. Those are a
// deliberately open bag (`lib/deliverable/edit-plan.ts` types branding as
// Record<string, unknown>; `projects.branding` is jsonb) because per-project
// divergence is the majority case in production — measured 08/05/2026, 9 of 11
// projects hold a branding value that DIFFERS from the account profile. Anything
// that validated or re-synced project branding against this registry would stomp
// them. Full two-way sync was considered and REJECTED in the predecessor spec.
// Do not reopen it.
//
// Client-safe: pure data + pure functions, no fs, no server imports.

export type ProfileTier = "must" | "boost" | "nice";

/** What KIND of value the column holds. Replaces the old implicit
 *  "everything is a nullable string" assumption — a boolean or jsonb column
 *  registered without this would be scored as a permanent, uncollectible gap. */
export type ProfileValueType = "text" | "url" | "color" | "enum" | "upload";

/** Which lane WRITES the field. This gates scoring and rendering, not just
 *  display: only "brand-editor" fields are counted by completenessSummary(),
 *  reported by profileGaps(), prefilled via PREFILL_KEYS, or rendered as an
 *  input. A text field owned by another lane (company_name) would otherwise be
 *  silently scored, moving every account's strip from "n of 31" to "n of 32". */
export type ProfileOwner = "brand-editor" | "prospect-enrichment" | "sending-identity" | "derived";

interface BaseFieldSpec {
  /** Column key on user_brand_profiles. */
  key: string;
  /** Popup-voice label ("your name") — AddressPopup renders it as-is; the
   *  Brand panel strip capitalizes the first letter. NOT the panel's label:
   *  the panel is form-voice ("Name", "Headshot URL") and the two deliberately
   *  differ. What must never disagree is WHICH FIELDS EXIST. */
  label: string;
  tier: ProfileTier;
  /** WHY we ask (NN/g: explain why) — required on must+boost, shown wherever
   *  the field is requested. */
  askCopy?: string;
  valueType: ProfileValueType;
}

/**
 * A field spec. Split into two arms so the type system — not a reviewer —
 * rejects `owner: "sending-identity"` carrying to a project: sending identity
 * and derived provenance must NEVER land in a project's branding blob and get
 * rendered into an email.
 */
export type ProfileFieldSpec =
  | (BaseFieldSpec & {
      owner: "brand-editor" | "prospect-enrichment";
      carriesToProject: boolean;
    })
  | (BaseFieldSpec & {
      owner: "sending-identity" | "derived";
      carriesToProject: false;
    });

/**
 * `as const satisfies` — NOT `: readonly ProfileFieldSpec[]`. An explicit
 * annotation erases the literal types at the construction site, which would
 * leave the discriminated union above with nothing to discriminate on and make
 * the carry guard a lie. It also preserves the literal key union that
 * app/api/user/brand/route.ts needs to keep the type safety its hand-written
 * `as const` arrays give it today.
 */
export const PROFILE_FIELDS = [
  // ── must — the CAN-SPAM signature block. The ONLY fields a popup may demand.
  {
    key: "agent_name",
    label: "your name",
    tier: "must",
    askCopy: "Every email you send signs with it.",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "brokerage",
    label: "your brokerage",
    tier: "must",
    askCopy: "Rides in your signature on every send.",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "business_address",
    label: "your business address",
    tier: "must",
    askCopy: "The legal footer every marketing email must carry (CAN-SPAM).",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  // ── boost — asked just-in-time, only when a build prints them.
  {
    key: "photo_url",
    label: "your headshot",
    tier: "boost",
    askCopy: "Your face in the header builds trust.",
    valueType: "upload",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "agent_title",
    label: "your title",
    tier: "boost",
    askCopy: "Sharpens your signature line.",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "license",
    label: "your license number",
    tier: "boost",
    askCopy: "Shown beside your name where required.",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "contact_phone",
    label: "your phone number",
    tier: "boost",
    askCopy: "Lets readers reach you in one tap.",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "contact_email",
    label: "your contact email",
    tier: "boost",
    askCopy: "Where replies land.",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "website_url",
    label: "your website",
    tier: "boost",
    askCopy: "Where your links point.",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "agent_bio",
    label: "your bio",
    tier: "boost",
    askCopy: "The story block in agent-forward emails.",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  // ── nice — Brand-panel checklist only; never popped.
  {
    key: "nickname",
    label: "your nickname",
    tier: "nice",
    valueType: "text",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "logo_url",
    label: "your logo",
    tier: "nice",
    valueType: "upload",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "primary_color",
    label: "your primary color",
    tier: "nice",
    valueType: "color",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "accent_color",
    label: "your accent color",
    tier: "nice",
    valueType: "color",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "text_color",
    label: "your text color",
    tier: "nice",
    valueType: "color",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "background_color",
    label: "your background color",
    tier: "nice",
    valueType: "color",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "surface_color",
    label: "your surface color",
    tier: "nice",
    valueType: "color",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "surface_dark_color",
    label: "your dark surface color",
    tier: "nice",
    valueType: "color",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "font_display",
    label: "your display font",
    tier: "nice",
    valueType: "enum",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "font_body",
    label: "your body font",
    tier: "nice",
    valueType: "enum",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "instagram_url",
    label: "your Instagram",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "facebook_url",
    label: "your Facebook",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "linkedin_url",
    label: "your LinkedIn",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "x_url",
    label: "your X profile",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "tiktok_url",
    label: "your TikTok",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "youtube_url",
    label: "your YouTube",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "pinterest_url",
    label: "your Pinterest",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "threads_url",
    label: "your Threads",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "unsubscribe_url",
    label: "your unsubscribe link",
    tier: "nice",
    valueType: "url",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "preferred_recipe",
    label: "your go-to email type",
    tier: "nice",
    valueType: "enum",
    owner: "brand-editor",
    carriesToProject: true,
  },
  {
    key: "default_photo_ratio",
    label: "your photo crop default",
    tier: "nice",
    valueType: "enum",
    owner: "brand-editor",
    carriesToProject: true,
  },

  // ── NOT brand-editor. Registered so the schema-parity guard can see them and
  //    so their exclusion is DECLARED rather than accidental. None of these are
  //    scored, prefilled, popped, or rendered as an input.
  //
  // Owned by the prospect-enrichment lane (lib/prospects/enrich-brand.ts →
  // lib/claim/claim-store.ts → app/api/prospect/open-project). It feeds the
  // project TITLE, which is why app/api/claim/route.ts deliberately drops it.
  // It DOES carry to a project — it just never renders an editor input, and it
  // must never be counted in the completeness denominator (it is text, so
  // valueType alone cannot keep it out; only `owner` can).
  {
    key: "company_name",
    label: "your company name",
    tier: "nice",
    valueType: "text",
    owner: "prospect-enrichment",
    carriesToProject: true,
  },
] as const satisfies readonly ProfileFieldSpec[];

/** Every registered key, including non-brand-editor ones. */
export const PROFILE_FIELD_KEYS: readonly string[] = PROFILE_FIELDS.map((s) => s.key);

/**
 * The fields the Brand panel scores, the popups collect, and the strip counts.
 * NOT every registered field — see ProfileOwner. This is the denominator.
 */
export const SCORED_FIELDS: readonly ProfileFieldSpec[] = PROFILE_FIELDS.filter(
  (s) => s.owner === "brand-editor",
);

export const SCORED_KEYS: readonly string[] = SCORED_FIELDS.map((s) => s.key);

export const MUST_KEYS: readonly string[] = SCORED_FIELDS.filter((s) => s.tier === "must").map(
  (s) => s.key,
);

/** The account→surface blank-fill set (EmailLabGridShell mount prefill,
 *  ProjectEmailLabClient merge). Scored fields only — a prospect-enrichment or
 *  sending-identity column must never prefill an editor surface. */
export const PREFILL_KEYS: readonly string[] = SCORED_KEYS;

/** The account→project carry set — replaces the hand-maintained select string
 *  AND object literal in lib/project/apply-brand.ts, which between them dropped
 *  24 of 38 columns. Includes non-brand-editor fields that legitimately carry
 *  (company_name); excludes sending-identity and derived by type. */
export const PROJECT_CARRY_KEYS: readonly string[] = PROFILE_FIELDS.filter(
  (s) => s.carriesToProject,
).map((s) => s.key);

export function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

/** An upload is picked, never typed — a popup can't collect it. Derived from
 *  valueType so the two can never disagree (this replaced a hand-set
 *  `typable` boolean that was a second source of truth for the same fact). */
export function isTypable(spec: ProfileFieldSpec): boolean {
  return spec.valueType !== "upload";
}

const BY_KEY = new Map<string, ProfileFieldSpec>(PROFILE_FIELDS.map((s) => [s.key, s]));

/** Spec lookup by key — delegates (lib/showcase/recipe.ts) read labels here. */
export function profileFieldSpec(key: string): ProfileFieldSpec | undefined {
  return BY_KEY.get(key);
}

/**
 * The fields still missing from `profile`, registry order. `needs` narrows to
 * those keys (unknown keys ignored — a caller can never make the ledger ask
 * for a field that doesn't exist); omitted = the full checklist.
 *
 * Scored fields only: a field another lane owns is not the user's gap to fill.
 */
export function profileGaps(
  profile: Record<string, string | null | undefined>,
  needs?: readonly string[],
): ProfileFieldSpec[] {
  const wanted = needs ? new Set(needs) : null;
  return SCORED_FIELDS.filter((s) => (!wanted || wanted.has(s.key)) && isBlank(profile[s.key]));
}

/** Gaps a popup can actually collect — drops uploads (headshot, logo). */
export function typableProfileGaps(
  profile: Record<string, string | null | undefined>,
  needs?: readonly string[],
): ProfileFieldSpec[] {
  return profileGaps(profile, needs).filter(isTypable);
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
    filled: SCORED_FIELDS.length - gaps.length,
    total: SCORED_FIELDS.length,
    must: gaps.filter((s) => s.tier === "must"),
    boost: gaps.filter((s) => s.tier === "boost"),
    nice: gaps.filter((s) => s.tier === "nice"),
  };
}
