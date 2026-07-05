import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountModalShell } from "@/components/account/AccountModalShell";
import { AccountBrandEditor } from "@/components/account/AccountBrandEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Intercepted /account/brand — soft navigation renders the editor as a modal
 *  OVER the current page (which stays mounted; no lost work). */
export default async function AccountBrandModal() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/brand");
  return (
    <AccountModalShell title="Your brand">
      <AccountBrandEditor variant="modal" />
    </AccountModalShell>
  );
}
