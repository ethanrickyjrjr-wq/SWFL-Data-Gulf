import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { loadAccountSchedules } from "@/lib/email/account-schedules";
import { ScheduleManager } from "@/components/account/ScheduleManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email schedule — SWFL Data Gulf" };

/** Hard-nav / refresh / deep-link form of the schedule manager. Soft navigation
 *  from inside the app intercepts to the @accountModal overlay instead. */
export default async function AccountSchedulesPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/schedules");
  const { schedules, audiences } = await loadAccountSchedules(supabase);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-white">Email schedule</h1>
      <ScheduleManager schedules={schedules} audiences={audiences} />
    </main>
  );
}
