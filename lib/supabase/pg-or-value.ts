// lib/supabase/pg-or-value.ts
//
// Quote a value for use inside a PostgREST `.or()` filter. PostgREST treats
// `, . : ( )` as reserved; a bare reserved char silently breaks the parse or
// mis-matches -- and because most callers await a query then guard with
// `if (error || !data) return []`, a broken parse doesn't throw, it just
// reads as "no rows", which is far more dangerous than a visible error.
// https://postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters
//
// Extracted (review fix, hermes-email-driver Task 3 round 2, 08/10/2026) from
// lib/project/feed.ts's original pgOrValue -- that file used it for one
// `.or()` filter (scope_value), lib/agent-feed/transitions-source.ts needs
// the identical quoting for a cursor `at` timestamp (which always contains
// the reserved `:` and `.` characters), and a second inline copy would have
// been RULE 0.5's exact anti-pattern: guessing/duplicating a fix that
// already existed instead of reusing it. Both call sites now import from
// here; neither defines its own copy.
export function pgOrValue(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}
