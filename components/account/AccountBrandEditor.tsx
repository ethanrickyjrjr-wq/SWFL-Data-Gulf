"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandingBlock } from "@/components/brand/BrandingBlock";
import { sanitizePalettes, type BrandPalette } from "@/lib/brand/palette";

/**
 * Account-level brand editor (route-modal + full page /account/brand). Global
 * save ONLY — there is no project in scope, so no save-target ambiguity.
 * Propagation is structural: resolve-brand falls back project → account, so a
 * save here reaches every surface except projects carrying their own override.
 */
export function AccountBrandEditor({ variant }: { variant: "modal" | "page" }) {
  const router = useRouter();
  const [branding, setBranding] = useState<Record<string, string>>({});
  const [palettes, setPalettes] = useState<BrandPalette[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/brand")
      .then((r) => (r.ok ? r.json() : null))
      .then((profile: Record<string, unknown> | null) => {
        if (profile) {
          const next: Record<string, string> = {};
          for (const [k, v] of Object.entries(profile)) {
            if (typeof v === "string" && v) next[k] = v;
          }
          setBranding(next);
          setPalettes(sanitizePalettes(profile.color_palettes));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function saveGlobal(): Promise<boolean> {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/user/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...branding, color_palettes: palettes }),
      });
      const ok = res.ok;
      setSavedMsg(
        ok ? "Saved — applies everywhere you haven't customized a project" : "Save failed",
      );
      return ok;
    } finally {
      setSaving(false);
    }
  }

  function persistPalettes(next: BrandPalette[]) {
    setPalettes(next);
    void fetch("/api/user/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color_palettes: next }),
    });
  }

  if (!loaded) {
    return <p className="py-8 text-center text-sm text-gray-400">Loading your brand…</p>;
  }
  return (
    <BrandingBlock
      branding={branding}
      onChange={setBranding}
      palettes={palettes}
      onPalettesChange={persistPalettes}
      onSaveGlobal={saveGlobal}
      saving={saving}
      savedMsg={savedMsg}
      onClose={() => (variant === "modal" ? router.back() : router.push("/project"))}
    />
  );
}
