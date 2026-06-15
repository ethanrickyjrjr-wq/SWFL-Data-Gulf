"use client";

import { useState } from "react";
import { DRAFT_KEY, addItem } from "@/lib/briefcase/draft";
import type { ProjectItem } from "@/lib/project/items";

interface Props {
  chartId: string;
  title: string;
}

export function AddToProject({ chartId, title }: Props) {
  const [filed, setFiled] = useState(false);

  function handleAdd() {
    const item: ProjectItem = {
      id: crypto.randomUUID(),
      added_at: new Date().toISOString(),
      origin: "web",
      kind: "chart",
      chart_id: chartId,
      title,
    };
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const existing: ProjectItem[] = raw ? (JSON.parse(raw) as ProjectItem[]) : [];
      const next = addItem(existing, item);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (SSR guard / private browsing)
    }
    setFiled(true);
    setTimeout(() => setFiled(false), 2000);
    void fetch("/api/meter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "item_add", report_id: "" }),
    }).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      className="text-xs text-[#00d4aa] underline underline-offset-2 transition-colors hover:text-[#00d4aa]/80"
    >
      {filed ? "Added ✓" : "Add to project"}
    </button>
  );
}
