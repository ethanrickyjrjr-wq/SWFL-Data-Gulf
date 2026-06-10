import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Refresh the Supabase auth session AND return the current user so the caller
 * (middleware.ts) can gate protected routes. Follows the canonical @supabase/ssr
 * Next.js pattern (verified against Supabase docs 2026-06-10):
 *   - cookies use ONLY getAll/setAll,
 *   - NO code runs between createServerClient and getUser(),
 *   - the returned `response` must be returned as-is by the caller (or, when the
 *     caller builds a new response e.g. a redirect, its cookies copied over) so
 *     the browser/server session stays in sync.
 *
 * When auth env vars are absent the edge runtime must not crash — we skip the
 * refresh and return a null user (callers then treat protected routes as gated,
 * never as open). Public, unauthenticated pages still pass through untouched.
 */
export const updateSession = async (
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> => {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (!supabaseUrl || !supabaseKey) {
    return { response: supabaseResponse, user: null };
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser() — a stray
  // call here can randomly log users out (per the Supabase SSR docs warning).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
};
