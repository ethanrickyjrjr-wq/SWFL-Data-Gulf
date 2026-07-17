// Shared Contact types for the briefcase email-blast feature.
// One source of truth for the API routes, import logic, and UI.

export interface Contact {
  id: string;
  user_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  tags: string[];
  attribs: Record<string, string>;
  unsubscribed: boolean;
  created_at: string;
}

/** A parsed-but-not-yet-persisted row (CSV / vCard import). */
export interface ContactRow {
  name: string | null;
  email: string;
  phone: string | null;
  tags: string[];
  attribs: Record<string, string>;
  /**
   * Optional opt-out signal from the source (e.g. a competitor platform's
   * unsubscribe list). ONE-WAY: `true` may be written; `false`/undefined
   * must never overwrite an existing opt-out — see lib/contacts/upsert.ts.
   */
  unsubscribed?: boolean;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  skip_reasons: string[];
}
