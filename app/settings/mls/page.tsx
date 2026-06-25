import type { Metadata } from "next";
import { MlsSettingsClient } from "./mls-settings-client";

export const metadata: Metadata = {
  title: "MLS Connection — SWFL Data Gulf",
};

export default function MlsSettingsPage() {
  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <MlsSettingsClient />
    </main>
  );
}
