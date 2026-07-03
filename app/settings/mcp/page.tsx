import type { Metadata } from "next";
import { McpSettingsClient } from "./mcp-settings-client";

export const metadata: Metadata = {
  title: "Connect your AI — SWFL Data Gulf",
};

export default function McpSettingsPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <McpSettingsClient />
    </main>
  );
}
