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
    <main className="min-h-dvh bg-gulf-midnight">
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary">Pricing</h1>
          <p className="mx-auto mt-3 max-w-md text-text-secondary">
            Building is free. You pay to send at scale — no contract, cancel anytime. Judge it the
            way you judge any tool: by the conversations it starts, not the data it holds.
          </p>
        </div>

        {usage && (
          <div className="mx-auto mt-10 max-w-md rounded-xl glass-card-modern border border-white/10 px-6 py-5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-text-primary">
                Current plan: <span className="capitalize text-gulf-teal">{usage.tier}</span>
              </p>
              <p className="metric-value text-sm text-text-secondary">
                {usage.sent.toLocaleString()} / {usage.limit.toLocaleString()} sends
              </p>
            </div>
            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded bg-white/10"
              role="progressbar"
              aria-label="Send usage"
              aria-valuenow={Math.min(usage.sent, usage.limit)}
              aria-valuemin={0}
              aria-valuemax={usage.limit}
            >
              <div
                className="h-full bg-gulf-teal"
                style={{ width: `${Math.min(100, (usage.sent / usage.limit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-10">
          <TierCards
            currentTier={usage?.tier ?? "free"}
            hasCustomer={hasCustomer}
            loggedIn={Boolean(user)}
          />
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-gulf-deep px-6 py-5 text-center text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Enterprise</p>
          <p className="mt-1">
            Higher limits, teams, or something custom — email{" "}
            <a
              href="mailto:hello@swfldatagulf.com"
              className="text-gulf-teal underline underline-offset-4"
            >
              hello@swfldatagulf.com
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
