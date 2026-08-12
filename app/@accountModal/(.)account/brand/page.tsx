import { AccountModalShell } from "@/components/account/AccountModalShell";
import { AccountBrandEditor } from "@/components/account/AccountBrandEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Intercepted /account/brand — soft navigation renders the editor as a modal
 *  OVER the current page (which stays mounted; no lost work). */
export default async function AccountBrandModal() {
  // Filling out the brand form needs NO login (operator, 08/11/2026: "My Brand does
  // not have to have email to log in to fill out"). Anonymous visitors can open and
  // edit; AccountBrandEditor's save path is what still needs an identity.
  return (
    <AccountModalShell title="Your brand">
      <AccountBrandEditor variant="modal" />
    </AccountModalShell>
  );
}
