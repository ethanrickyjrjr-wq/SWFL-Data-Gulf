import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — SWFL Data Gulf",
  description: "Email send tiers for SWFL Data Gulf. Full billing coming soon.",
};

const TIERS = [
  { name: "Free", limit: "50 sends / month", price: "No cost" },
  { name: "Starter", limit: "500 sends / month", price: "Coming soon" },
  { name: "Growth", limit: "2,000 sends / month", price: "Coming soon" },
  { name: "Pro", limit: "10,000 sends / month", price: "Coming soon" },
] as const;

export default function BillingPage() {
  return (
    <main className="min-h-dvh flex flex-col">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Pricing</h1>
        <p className="text-sm text-neutral-500 mb-10">
          Email send limits by tier. Payment rails are coming soon — reach out to unlock a higher
          tier early.
        </p>

        <div className="space-y-4 mb-12">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-5 py-4"
            >
              <div>
                <p className="font-medium">{tier.name}</p>
                <p className="text-sm text-neutral-500">{tier.limit}</p>
              </div>
              <span className="text-sm font-medium text-neutral-700">{tier.price}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-5 py-4 text-sm text-neutral-600 space-y-1">
          <p className="font-medium text-neutral-800">Coming soon</p>
          <p>
            Full billing is under construction. Limits reset on the first of each calendar month
            (UTC).
          </p>
          <p>
            To request a higher limit or ask about enterprise access, email{" "}
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
