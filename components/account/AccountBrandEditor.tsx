"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandingBlock } from "@/components/brand/BrandingBlock";
import { sanitizePalettes, type BrandPalette } from "@/lib/brand/palette";
import { LoginModal } from "@/components/landing/LoginModal";

/**
 * Account-level brand editor (route-modal + full page /account/brand). Global
 * save ONLY — there is no project in scope, so no save-target ambiguity.
 * Propagation is structural: resolve-brand falls back project → account, so a
 * save here reaches every surface except projects carrying their own override.
 *
 * Filling this out needs no account (both /account/brand routes stopped gating on
 * login 08/11/2026). SAVE is the identity checkpoint: an anonymous PATCH 401s, and
 * that is the trigger — not a dead end — for the email-OTP LoginModal, which creates
 * the account on the spot (signInWithOtp shouldCreateUser, same engine as /login).
 * `onSignedIn` keeps this component mounted and retries the same save, so nothing
 * the visitor typed is lost to a redirect (operator, 08/11/2026: "saving brand
 * creates new account with email").
 */
export function AccountBrandEditor({ variant }: { variant: "modal" | "page" }) {
  const router = useRouter();
  const [branding, setBranding] = useState<Record<string, string>>({});
  const [palettes, setPalettes] = useState<BrandPalette[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    fetch("/api/user/brand")
      .then((r) => (r.ok ? r.json() : null))
      .then((profile: Record<string, unknown> | null) => {
        if (profile) {
          const next: Record<string, string> = {};
          for (const [k, v] of Object.entries(profile)) {
            if (k === "account_email") continue; // read-only auth email, not a brand field
            if (typeof v === "string" && v) next[k] = v;
          }
          // First-login pre-fill: seed a blank Email field with the address the
          // account was created with. A visible default in the input — persisted
          // only when the user actually saves.
          if (!next.contact_email && typeof profile.account_email === "string") {
            next.contact_email = profile.account_email;
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
      // No account yet — the OTP modal creates one, then retries this exact save.
      // Not a failure state: don't show "Save failed" for a save that hasn't
      // actually been attempted with an identity yet.
      if (res.status === 401) {
        setAuthOpen(true);
        return false;
      }
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
    <>
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
      <LoginModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Save your brand"
        blurb="Enter your email — we'll send you a code and save what you just filled in. Free, no credit card."
        onSignedIn={async () => {
          setAuthOpen(false);
          await saveGlobal();
        }}
      />
    </>
  );
}
