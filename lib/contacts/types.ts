// Shared Contact types for the briefcase email-blast feature.
// One source of truth for the API routes, import logic, and UI.

export interface Contact {
  id: string;
  user_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  tags: string[];
  unsubscribed: boolean;
  created_at: string;
}

/** A parsed-but-not-yet-persisted row (CSV / vCard import). */
export interface ContactRow {
  name: string | null;
  email: string;
  phone: string | null;
  tags: string[];
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  skip_reasons: string[];
}
