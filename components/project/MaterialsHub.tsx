"use client";
import { useState } from "react";
import type { DeliverableRow } from "@/app/project/[id]/workspace/types";
import { IntentLine } from "./IntentLine";
import { TemplateRail } from "./TemplateRail";
import { MaterialRow } from "./MaterialRow";

interface Props {
  projectId: string;
  /** Heads only, each with `.versions` (from splitDeliverableVersions). */
  materials: (DeliverableRow & { versions: DeliverableRow[] })[];
  /** Called when Update Data (↻) is triggered for a material. */
  onRefresh: (id: string) => Promise<void>;
  /** Called when the intent line submits — picks a template, fills data, saves. */
  onAiMaterial: (intent: string) => Promise<{ template: { name: string }; id: string } | null>;
  /** Called when a report-template chip is clicked. Task 9 wires this. */
  onBuildReport?: (templateId: string) => void;
  /** Soft-delete a version row. Task 9 wires this. */
  onTrash?: (id: string) => Promise<void>;
}

export function MaterialsHub({
  projectId,
  materials,
  onRefresh,
  onAiMaterial,
  onBuildReport,
  onTrash,
}: Props) {
  const [highlight, setHighlight] = useState(false);

  async function handleSubmit(
    intent: string,
  ): Promise<{ template: { name: string }; id: string } | null> {
    const res = await onAiMaterial(intent);
    if (!res) {
      setHighlight(true);
      // One-pulse: remove ring after animation completes
      setTimeout(() => setHighlight(false), 1200);
    }
    return res;
  }

  return (
    <div className="space-y-6">
      {/* ── Create rail: elevated doing surface ── */}
      <div
        className="rounded-xl border border-white/[0.08] bg-[#0d1e2b]/70 p-5"
        style={{ borderTopColor: "rgba(27,184,201,0.3)" }}
      >
        <IntentLine onSubmit={handleSubmit} />
        <TemplateRail projectId={projectId} highlight={highlight} onBuildReport={onBuildReport} />
      </div>

      {/* ── Library: calm management surface ── */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-white/50">Materials</span>
          {materials.length > 0 && (
            <span className="text-[10px] text-white/35">{materials.length}</span>
          )}
        </div>

        {materials.length === 0 ? (
          // Gap 6 empty state — guided, never dead
          <div className="rounded-lg border border-dashed border-white/10 px-6 py-10 text-center">
            <p className="text-sm text-white/40">
              Start your first piece — describe it above, or pick a template.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.08] overflow-hidden">
            {materials.map((m) => (
              <MaterialRow
                key={m.id}
                d={m}
                projectId={projectId}
                onRefresh={onRefresh}
                onTrash={onTrash}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
