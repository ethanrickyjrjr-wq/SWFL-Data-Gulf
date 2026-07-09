import type { Metadata } from "next";
import { DeliverabilitySettingsClient } from "./deliverability-settings-client";

export const metadata: Metadata = {
  title: "Deliverability — SWFL Data Gulf",
};

export default function DeliverabilitySettingsPage() {
  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <DeliverabilitySettingsClient />
    </main>
  );
}
