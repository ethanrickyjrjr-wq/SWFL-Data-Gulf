import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const cookieAdapter = (cookieStore: Awaited<ReturnType<typeof cookies>>) => ({
  getAll() {
    return cookieStore.getAll();
  },
  setAll(
    cookiesToSet: {
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }[],
  ) {
    try {
      cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
    } catch {
      // The `setAll` method was called from a Server Component.
      // This can be ignored if you have middleware refreshing user sessions.
    }
  },
});

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) =>
  createServerClient<Database>(supabaseUrl!, supabaseKey!, {
    cookies: cookieAdapter(cookieStore),
  });

// TEMPORARY opt-out — deferred fixes / data_lake reach only. ESLint (Task 5) blocks new uses.
export const createClientUntyped = (cookieStore: Awaited<ReturnType<typeof cookies>>) =>
  createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: cookieAdapter(cookieStore),
  });
