-- Unify contact stores: merge email_contacts into public.contacts (canonical).
-- Spec: docs/superpowers/specs/2026-07-05-unify-contact-stores-design.md
-- Closes (with code changes + live verify): contacts_email_vs_public_lane
-- Idempotent — safe to re-run. Additive only: does not modify or drop email_contacts.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- email_contacts emails are already lowercase (normalizeEmail on every write path);
-- contacts manual-add stored as-given. Lowercase contacts.email first so the merge
-- below matches on the same (user_id, email) key email_contacts uses. A collision
-- from lowercasing merges via the same union-tags / non-null-wins rule as the main
-- merge (ON CONFLICT keeps the older/first row's id — unsub links point at ids).
UPDATE public.contacts c
SET
  email = lower(c.email),
  updated_at = now()
WHERE c.email <> lower(c.email)
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts c2
    WHERE c2.user_id = c.user_id AND c2.email = lower(c.email) AND c2.id <> c.id
  );

-- Rows that WOULD collide after lowercasing: merge into whichever row is OLDER
-- (by created_at — id is a random gen_random_uuid(), never ordered by age, so it
-- cannot be used to pick "the original" row), then drop the newer duplicate. Rare
-- (manual-add path only, zero cases in current data); handled explicitly so the
-- unique index below can't fail if this ever runs against data that does collide.
-- Two independent statements (not a nested writable CTE) so execution order is
-- unambiguous: merge first, delete second.
UPDATE public.contacts keep
SET
  name = COALESCE(keep.name, dup.name),
  phone = COALESCE(keep.phone, dup.phone),
  tags = (SELECT ARRAY(SELECT DISTINCT unnest(keep.tags || dup.tags))),
  unsubscribed = keep.unsubscribed OR dup.unsubscribed,
  updated_at = now()
FROM public.contacts dup
WHERE dup.user_id = keep.user_id
  AND dup.email = lower(keep.email)
  AND dup.id <> keep.id
  AND dup.email <> lower(dup.email)
  AND keep.created_at <= dup.created_at;

DELETE FROM public.contacts dup
USING public.contacts keep
WHERE keep.user_id = dup.user_id
  AND keep.email = lower(dup.email)
  AND keep.id <> dup.id
  AND dup.email <> lower(dup.email)
  AND keep.created_at <= dup.created_at;

-- Now safe: merge email_contacts into contacts. union tags, non-null wins on name.
-- phone/unsubscribed are email_contacts-absent fields, so contacts' existing values
-- are always preserved (COALESCE against a NULL source is a no-op).
INSERT INTO public.contacts (user_id, email, name, tags, created_at, updated_at)
SELECT ec.user_id, lower(ec.email), ec.name, ec.tags, ec.created_at, now()
FROM public.email_contacts ec
ON CONFLICT (user_id, email) DO UPDATE SET
  name = COALESCE(public.contacts.name, EXCLUDED.name),
  tags = (SELECT ARRAY(SELECT DISTINCT unnest(public.contacts.tags || EXCLUDED.tags))),
  updated_at = now();

NOTIFY pgrst, 'reload schema';
