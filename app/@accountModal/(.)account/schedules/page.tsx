import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadAccountSchedules } from "@/lib/email/account-schedules";
import { AccountModalShell } from "@/components/account/AccountModalShell";
import { ScheduleManager } from "@/components/account/ScheduleManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Intercepted /account/schedules — soft navigation renders the manager as a
 *  modal OVER the current page (which stays mounted; no lost work). */
export default async function AccountSchedulesModal() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/schedules");
  const { schedules, audiences } = await loadAccountSchedules(supabase);
  return (
    <AccountModalShell title="Email schedule">
      <ScheduleManager schedules={schedules} audiences={audiences} />
    </AccountModalShell>
  );
}
