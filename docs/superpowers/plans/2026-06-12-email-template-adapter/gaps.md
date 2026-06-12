# Known Gaps — Resolve Before User-Facing Launch

These must be addressed before any Section 1–3 output ships to real users. None of them block Section 4 (brand persistence), which can be built now.

---

## GAP 1 — Sender Identity (HIGH)

`DIGEST_SENDER_NAME` / `DIGEST_SENDER_ADDRESS` are single env vars for the SWFL digest pipeline. Project-level sends must NOT use them.

**Fix:**
- Add `sender_name TEXT` and `sender_address TEXT` to `user_brand_profiles` (Section 4 migration)
- MVP sender format: `"Acme Corp via SWFL Data Gulf" <hello@mail.swfldatagulf.com>`
- `sender_name` from the profile supplies the name portion
- Build a separate `/api/email/project-broadcast` route — do NOT expand the existing digest route
- Env vars stay for the SWFL digest pipeline only
- `SWFL_TOKEN_DEFAULTS.SENDER_NAME` and `.SENDER_ADDRESS` = `""` (empty string, never a throw — the throw guard lives only at `broadcast/route.ts:53–54`)
- White-label custom domain sending: park until there's demand

---

## GAP 2 — Resend Audience Isolation (HIGH)

All users sharing one Resend audience means user A's unsubscribe can pollute user B's list.

**Fix:**
- Add `resend_audience_id TEXT` to `projects` table
- On first email setup for a project: call `resend.audiences.create({ name: projectId })`, write returned ID to `projects.resend_audience_id`
- Broadcast calls use `project.resend_audience_id` instead of the global `getDigestSegmentId()`
- SWFL digest keeps its own audience via `RESEND_DIGEST_SEGMENT_ID` — unaffected

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_email_project_columns.sql` — both GAP 2 and GAP 4 columns go in one file.

---

## GAP 3 — `brandThemeToTokens()` Null Path (HIGH)

For new users with no brand on file, `brandThemeToTokens(null)` returns `{}`. If the caller doesn't catch this, `renderEmailTemplate()` fills with SWFL defaults — wrong for a real user.

**Fix:** The null check belongs in the briefcase/project UI layer, not inside the render function. When `resolveUserBrand()` returns null, surface a "set your brand colors" prompt before rendering. Never let SWFL colors silently fill a user's email.

Correct signature (in `render-template.ts`):
```typescript
export function brandThemeToTokens(theme: BrandTheme | null | undefined): Partial<TemplateTokens> {
  if (!theme) return {};
  return {
    ...(theme.primary ? { PRIMARY: theme.primary } : {}),
    ...(theme.accent ? { ACCENT: theme.accent } : {}),
    ...(theme.logoUrl ? { LOGO_URL: theme.logoUrl } : {}),
  };
}
```

---

## GAP 4 — Shell Selection Model (MEDIUM)

5 static HTML files work for internal use but need runtime selection for users picking a template per project.

**Fix:**
- Static registry in code (no DB):
```typescript
// lib/email/templates/template-registry.ts
export const EMAIL_TEMPLATES = {
  'announcement':   'lib/email/templates/shells/announcement.html',
  'digest':         'lib/email/templates/shells/digest.html',
  'property-alert': 'lib/email/templates/shells/property-alert.html',
  'market-report':  'lib/email/templates/shells/market-report.html',
  'one-liner':      'lib/email/templates/shells/one-liner.html',
} as const;
export type TemplateSlug = keyof typeof EMAIL_TEMPLATES;
```
- `renderEmailTemplate()` takes a `TemplateSlug`, reads the file internally — callers never pass raw HTML
- `projects.email_template_slug TEXT DEFAULT 'digest'` — add to migration file (same file as GAP 2)
- Switching templates: write new slug to `projects.email_template_slug`, brand tokens unchanged — colors follow, only layout changes

**Slug names above are placeholders** — update to match actual filenames when shells are committed.
