"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard island. The page (a server component) computes the chase-list
 * markdown deterministically and passes it in; this leaf just copies it. Kept
 * tiny on purpose — it's the only client JS on the page.
 */
export function ChaseListButton({
  markdown,
  count,
}: {
  markdown: string;
  count: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
      disabled={count === 0}
    >
      {copied ? "Copied ✓" : `Copy chase list (${count})`}
    </button>
  );
}
