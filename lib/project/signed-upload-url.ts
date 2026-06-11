/**
 * Short-lived (1h) signed URLs for private `project-uploads` objects.
 *
 * The bucket is PRIVATE — a raw object path is not fetchable. Render-time always
 * re-signs (URLs expire, the stored `storage_path` does not). The caller passes
 * whichever client's auth context is allowed to read the object:
 *
 *  - `/project/[id]` (owner-only, RLS-gated): the cookie/session client — authed
 *    as the owner, so Storage RLS lets it read its own objects.
 *  - `/p/[id]` (public deliverable, viewer may be anonymous): the service-role
 *    client — a public viewer has no access to the owner's private object under
 *    their own JWT, so only the server can mint the link.
 *
 * Verified API (session-8 FINDINGS-storage.md):
 *   createSignedUrl(path, expiresInSeconds) -> { data: { signedUrl }, error }
 * Single-path call in a Promise.all loop — no reliance on the undocumented batch
 * return shape. Paths that fail to sign are omitted from the map so the render
 * falls back to a plain "unavailable" line, never a broken `src`.
 */

export const UPLOADS_BUCKET = "project-uploads";

/** Structural type — satisfied by both the SSR cookie client and the
 *  supabase-js service-role client, dodging their generic-param differences. */
type StorageSigner = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

export async function signedUploadUrls(
  client: StorageSigner,
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const out: Record<string, string> = {};
  await Promise.all(
    unique.map(async (path) => {
      const { data, error } = await client.storage
        .from(UPLOADS_BUCKET)
        .createSignedUrl(path, expiresInSeconds);
      if (!error && data?.signedUrl) out[path] = data.signedUrl;
    }),
  );
  return out;
}
