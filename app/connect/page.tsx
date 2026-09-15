import type { Metadata } from "next";
import { ConnectSnippet } from "./ConnectSnippet";

export const metadata: Metadata = {
  title: "Connect SWFL Data Gulf to your AI — SWFL Data Gulf",
  description:
    "Ask Claude, Cursor, or any MCP client about Southwest Florida real estate — housing, flood risk, permits, tourism, and more, every number sourced. No signup, 20 free lookups a day.",
};

const EXAMPLE_PROMPTS = [
  "What's the flood risk in ZIP 33914?",
  "Is Fort Myers Beach a good buy right now?",
  "How's the Lee County housing market trending this quarter?",
  "What's driving tourism season in Naples?",
  "Is commercial real estate activity picking up in Collier County?",
  "How exposed is Southwest Florida to hurricane risk this year?",
];

export default function ConnectPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-gulf-teal">
        For your own AI, not our chat
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">
        Ask your AI about Southwest Florida
      </h1>
      <p className="mt-4 text-gray-400">
        SWFL Data Gulf is also a live MCP server — housing, commercial real estate, permits,
        traffic, tourism, hurricane risk, sector credit, and macro context for Lee and Collier
        counties, every figure cited to its source. Connect it to Claude, Cursor, Cline, or Windsurf
        and ask it directly, in your own conversation.
      </p>

      <div className="mt-8 rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4">
        <h2 className="text-sm font-semibold text-white">Try asking it</h2>
        <ul className="mt-3 space-y-2">
          {EXAMPLE_PROMPTS.map((q) => (
            <li key={q} className="text-sm text-gray-300">
              &ldquo;{q}&rdquo;
            </li>
          ))}
        </ul>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-white">Connect it</h2>
      <p className="mt-1 text-xs text-gray-500">
        No signup, no key. 15 free lookups a month —{" "}
        <a
          href="/settings/mcp"
          className="text-gulf-teal underline underline-offset-4 hover:text-gulf-teal/80"
        >
          connect an account
        </a>{" "}
        for unlimited access and the tools that write into a project.
      </p>
      <ConnectSnippet />

      <p className="mt-8 text-xs text-gray-500">
        Prefer to just ask in a browser?{" "}
        <a
          href="/ask"
          className="text-gulf-teal underline underline-offset-4 hover:text-gulf-teal/80"
        >
          Try the web version
        </a>{" "}
        — no account needed there either.
      </p>
    </main>
  );
}
