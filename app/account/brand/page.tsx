import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { AccountBrandEditor } from "@/components/account/AccountBrandEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your brand — SWFL Data Gulf" };

/** Hard-nav / refresh / deep-link form of the brand editor. Soft navigation from
 *  inside the app intercepts to the @accountModal overlay instead. */
export default async function AccountBrandPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/brand");
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-white">Your brand</h1>
      <AccountBrandEditor variant="page" />
    </main>
  );
}
