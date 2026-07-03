// app/billing/page.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { checkUsageLimit } from "@/lib/email/usage";
import { TierCards } from "./TierCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — SWFL Data Gulf",
  description: "Send tiers for SWFL Data Gulf. Builds are free — you pay to send at scale.",
};

export default async function BillingPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let usage: Awaited<ReturnType<typeof checkUsageLimit>> | null = null;
  let hasCustomer = false;
  if (user) {
    usage = await checkUsageLimit(user.id);
    const db = createServiceRoleClient();
    const { data } = await db
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hasCustomer = Boolean(data?.stripe_customer_id);
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Pricing</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Building is free. You pay to send at scale — no contract, cancel anytime.
        </p>

        {usage && (
          <div className="mb-8 rounded-lg border border-neutral-200 px-5 py-4">
            <p className="text-sm font-medium">
              Current plan: <span className="capitalize">{usage.tier}</span>
            </p>
            <p className="text-sm text-neutral-500">
              {usage.sent.toLocaleString()} of {usage.limit.toLocaleString()} sends used this month
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-neutral-100">
              <div
                className="h-full bg-neutral-800"
                style={{ width: `${Math.min(100, (usage.sent / usage.limit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <TierCards currentTier={usage?.tier ?? "free"} hasCustomer={hasCustomer} />

        <div className="mt-12 rounded-lg bg-neutral-50 border border-neutral-200 px-5 py-4 text-sm text-neutral-600 space-y-1">
          <p className="font-medium text-neutral-800">Enterprise</p>
          <p>
            Higher limits, teams, or something custom — email{" "}
            <a href="mailto:hello@swfldatagulf.com" className="underline text-neutral-800">
              hello@swfldatagulf.com
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
