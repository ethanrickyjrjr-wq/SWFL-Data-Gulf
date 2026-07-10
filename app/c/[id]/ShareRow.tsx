"use client";

// Share actions for a saved chart: copy the public link, download the social
// card PNG, copy an embed snippet. The "Scheduled socials" pill is a roadmap
// marker, deliberately not a button.

import { useState } from "react";

interface Props {
  id: string;
  title: string;
  siteUrl: string; // absolute origin, no trailing slash
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

export function ShareRow({ id, title, siteUrl }: Props) {
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  function flash(kind: "link" | "embed") {
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  const embedSnippet =
    `<iframe src="${siteUrl}/embed/c/${id}" width="640" height="420" ` +
    `style="border:0;border-radius:12px;overflow:hidden" loading="lazy" ` +
    `title="${title.replace(/"/g, "&quot;")} — SWFL Data Gulf"></iframe>`;

  const btn =
    "text-xs text-gulf-teal underline underline-offset-2 transition-colors hover:text-gulf-teal/80";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <button
        type="button"
        className={btn}
        onClick={() => void copyText(`${siteUrl}/c/${id}`).then(() => flash("link"))}
      >
        {copied === "link" ? "Link copied ✓" : "Copy link"}
      </button>
      <a className={btn} href={`/c/${id}/card?download=1`}>
        Download PNG
      </a>
      <button
        type="button"
        className={btn}
        onClick={() => void copyText(embedSnippet).then(() => flash("embed"))}
      >
        {copied === "embed" ? "Embed code copied ✓" : "Copy embed code"}
      </button>
      <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-gray-400">
        Scheduled socials — coming soon
      </span>
    </div>
  );
}
