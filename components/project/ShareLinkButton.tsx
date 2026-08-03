// components/project/ShareLinkButton.tsx
// Copy-the-public-link button (spec 2026-08-03 piece 1). Clipboard failure
// (non-HTTPS / permission denied) falls back to showing the URL inline —
// NEVER a native prompt (modal ban, ProjectEmailLabClient.tsx:511).
"use client";
import { useState } from "react";
import { buildShareUrl, canShare } from "@/lib/share/share-link";

interface Props {
  deliverableId: string;
  status: string;
  className: string;
}

export function ShareLinkButton({ deliverableId, status, className }: Props) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  if (!canShare(status)) return null;

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    const url = buildShareUrl(window.location.origin, deliverableId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — show the link inline for manual copy.
      setFallbackUrl(url);
    }
  }

  if (fallbackUrl) {
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 select-all text-[10px] text-white/50"
      >
        {fallbackUrl}
      </span>
    );
  }

  return (
    <button title="Copy public link" onClick={handleShare} className={className}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
