import type { Metadata } from "next";
import { AccountBrandEditor } from "@/components/account/AccountBrandEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your brand — SWFL Data Gulf" };

/** Hard-nav / refresh / deep-link form of the brand editor. Soft navigation from
 *  inside the app intercepts to the @accountModal overlay instead. */
export default async function AccountBrandPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  // Filling out the brand form needs NO login (operator, 08/11/2026: "My Brand does
  // not have to have email to log in to fill out"). Anonymous visitors can open and
  // edit; AccountBrandEditor's save path is what still needs an identity.
  // First-login landing (post-login routing sends new accounts here with
  // ?welcome=1). One line of copy, no stored state — harmless on revisit.
  const { welcome } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-white">Your brand</h1>
      {welcome === "1" && (
        <p className="mb-6 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm leading-6 text-gray-200">
          Your account is ready — set up your brand so every build signs as you. Your email is
          already filled in; everything here is optional.
        </p>
      )}
      <AccountBrandEditor variant="page" />
    </main>
  );
}
