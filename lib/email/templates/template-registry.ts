// Maps semantic email slug → renderHtmlTemplate slug (relative to templates/html/)
export const EMAIL_TEMPLATES = {
  compare: "email/email-compare",
  hbar: "email/email-hbar",
  hero: "email/email-hero",
  ranked: "email/email-ranked",
  table: "email/email-table",
} as const;

export type TemplateSlug = keyof typeof EMAIL_TEMPLATES;
