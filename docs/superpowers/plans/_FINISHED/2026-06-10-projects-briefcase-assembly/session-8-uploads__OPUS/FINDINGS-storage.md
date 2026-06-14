# FINDINGS — Supabase Storage (verified in-session 2026-06-10)

Vendor-First (CLAUDE.md RULE 1). Storage is a surface this repo has never used.
Verified live against the Supabase docs **in this session** — Tasks 02/03/04 code directly
against the shapes below. Do not "remember" these; if you re-touch Storage, re-fetch.

**SDK versions (package.json):** `@supabase/ssr ^0.10.3`, `@supabase/supabase-js ^2.106.1`.
Browser uploads use the existing `utils/supabase/client.ts` (`createBrowserClient`) so the
user's JWT rides the request and Storage RLS applies — **no new dependency**.

---

## 1. Private bucket + size/MIME limits (SQL)

Buckets carry their own `public`, `file_size_limit` (bytes), and `allowed_mime_types`
columns. Insert idempotently:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-uploads', 'project-uploads', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
```

- `public=false` → objects are only reachable via a **signed URL** or an authenticated
  request that passes RLS. There is no anonymous public URL.
- `file_size_limit = 10485760` = 10 MiB. The bucket limit is the **real** gate; the
  client check is just fail-fast UX.
- `allowed_mime_types` rejects anything off-list at the Storage API (server-side),
  including HEIC (`image/heic`/`image/heif` are NOT in the list).

## 2. `storage.objects` RLS — per-operation, path-prefix keyed to the caller's uid

**Verified guidance:** Supabase recommends **separate policies per operation**
(SELECT / INSERT / UPDATE / DELETE), `TO authenticated`, not a single `FOR ALL`.
The first path segment is matched with `(storage.foldername(name))[1]`.

Verified docs example (verbatim):

```sql
create policy "Allow authenticated uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'my_bucket_id' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);
```

`auth.jwt()->>'sub'` and `auth.uid()::text` are the **same value** (the caller's user
UUID as text). We use `(select auth.uid()::text)` — wrapping the auth call in a scalar
`(select …)` is Supabase's documented RLS performance optimization (evaluated once per
query, not per row). INSERT/UPDATE use `WITH CHECK`; SELECT/DELETE use `USING`; UPDATE
gets both.

**Object path contract:** `{user_id}/{project_id}/{uuid}.{ext}` → `foldername(name)[1]`
is `{user_id}`, so a user can only read/write/delete objects under their own uid prefix.
A mis-index here (`[2]`, or matching the whole `name`) is the leak this task guards against.

## 3. Browser upload (user JWT) — `upload(path, file, options)`

```js
const { data, error } = await supabase.storage
  .from('project-uploads')
  .upload(path, file, { contentType: file.type, upsert: false });
// success → data.path ; failure → error
```

- Default `upsert:false` → a duplicate path returns **400 "Asset Already Exists"**. We
  use `crypto.randomUUID()` in the path, so collisions don't happen.
- Standard upload is documented as "ideal for files ≤ 6 MB"; it still works up to the
  bucket's `file_size_limit` (our 10 MB cap). Resumable upload is only *recommended*
  (not required) above 6 MB — out of scope for v1 (images + PDFs, attach-only).
- RLS applies because the call carries the user's JWT (browser client). An anonymous
  client has no `auth.uid()` → INSERT policy fails → upload denied. Hence anon sees a
  login prompt, never a silent failure.

## 4. Signed URL (server-side, 1h) — `createSignedUrl(path, expiresIn)`

```js
const { data, error } = await supabase.storage
  .from('project-uploads')
  .createSignedUrl(path, 3600);   // expiresIn in SECONDS
if (data) console.log(data.signedUrl);   // → temporary https URL
```

- Return shape: `{ data: { signedUrl }, error }`. Single-path is the documented call.
  A batch `createSignedUrls(paths[], expiresIn)` exists in the SDK but is **not** in the
  serving-downloads guide, so we use single `createSignedUrl` in a `Promise.all` loop —
  no reliance on an undocumented return shape.
- **Never** store or render the raw object path as a URL — a private object path is not
  fetchable. The snapshot stores `storage_path`; render-time always re-signs (URLs expire,
  the path doesn't). This is why `/p/[id]` must re-sign on every render.
- On `/project/[id]` (owner-only, RLS-gated) the **cookie/session** client signs (authed
  as owner → RLS lets owner read own object).
- On `/p/[id]` (public deliverable, viewer may be anonymous) the **service-role** client
  signs — a public viewer has no access to the owner's private object under their own JWT,
  so only the server (service role) can mint the signed URL for them.
