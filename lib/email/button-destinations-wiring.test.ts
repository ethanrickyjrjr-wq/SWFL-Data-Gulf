// lib/email/button-destinations-wiring.test.ts
//
// The WIRING tests for role-keyed button destinations. `button-destinations.test.ts`
// pins the pure resolver; this file pins the places it is actually CALLED from,
// because a tested resolver nobody calls is exactly the "green lab demo" failure the
// button-links handoff §6 warns about.
//
// Every test is named for the failure mode it targets (RULE 3.5).

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyBrand } from "./brand/apply-brand";
import { brandingToTokens } from "./brand/branding-to-tokens";
import { applyLinkFallbacks, auditDocLinks } from "./link-audit";
import {
  buttonRoleOf,
  destinationTokenKey,
  needsHouseConfirm,
  roleDestinationsFromBrand,
  savedDestinationsFromTokens,
} from "./button-destinations";
import type { EmailDoc } from "./doc/types";

const REPO = join(import.meta.dir, "..", "..");

const doc = (props: Record<string, unknown>): EmailDoc =>
  ({ globalStyle: {}, blocks: [{ id: "b1", type: "button", props }] }) as unknown as EmailDoc;

const urlOf = (d: EmailDoc) => (d.blocks[0]!.props as { url?: string }).url;

// ── the operator's instruction, 08/03/2026 ───────────────────────────────────
// "make sure all words on a button are editable by the user and all urls can be
// changed by the user for each button". The URL field already existed in the
// inspector; what did not exist was the edit SURVIVING the next brand overlay.
describe("a user-typed URL is the user's — applyBrand must not clobber it", () => {
  test("urlSource:user survives the brand overlay untouched", () => {
    const out = applyBrand(
      doc({ label: "Book a call", url: "https://agent.example/book", urlSource: "user" }),
      { WEBSITE_URL: "https://brand.example", CTA_URL: "https://brand.example" },
    );
    expect(urlOf(out)).toBe("https://agent.example/book");
  });

  test("urlSource:user survives even when a SAVED role destination exists", () => {
    const out = applyBrand(
      doc({ role: "community", url: "https://agent.example/my-pick", urlSource: "user" }),
      { [destinationTokenKey("community")]: "https://brand.example/communities" },
    );
    expect(urlOf(out)).toBe("https://agent.example/my-pick");
  });
});

// THE MIGRATION DEFAULT. Every button in every saved deliverable predates
// `urlSource`. If absent were read as "user", the whole back catalogue would freeze
// and the brand overlay would silently switch off for it.
describe("absent urlSource means ENGINE — the back catalogue keeps taking the overlay", () => {
  test("unmarked url is engine-owned, so brand still applies", () => {
    const out = applyBrand(doc({ label: "View", url: "https://old-engine-value.example" }), {
      WEBSITE_URL: "https://brand.example",
      CTA_URL: "https://brand.example",
    });
    expect(urlOf(out)).toBe("https://brand.example");
  });

  test("a doc with no role at all still resolves (defaults to primary-cta)", () => {
    expect(buttonRoleOf(undefined)).toBe("primary-cta");
    expect(buttonRoleOf("not-a-real-role")).toBe("primary-cta");
    const out = applyBrand(doc({ label: "View", url: "" }), { CTA_URL: "https://brand.example" });
    expect(urlOf(out)).toBe("https://brand.example");
  });
});

// The exception the OLD code protected explicitly. Under role-keying it must stay an
// explicit early return — never an emergent property of rung ordering.
describe("engine-set mailto: reply CTA survives the overlay (regression)", () => {
  test("mailto is untouched by a plain website brand", () => {
    const out = applyBrand(doc({ label: "Reply", url: "mailto:agent@example.com" }), {
      CTA_URL: "https://brand.example",
      WEBSITE_URL: "https://brand.example",
    });
    expect(urlOf(out)).toBe("mailto:agent@example.com");
  });

  test("a saved role destination may NOT out-rank the reply address", () => {
    const out = applyBrand(doc({ role: "primary-cta", url: "mailto:agent@example.com" }), {
      [destinationTokenKey("primary-cta")]: "https://brand.example/saved",
    });
    expect(urlOf(out)).toBe("mailto:agent@example.com");
  });
});

// The granularity bug this build exists to fix: one global override meant an agent
// could not give the community button one destination and a booking button another.
describe("per-role destinations, not one global override", () => {
  test("the saved role destination beats the generic website", () => {
    const out = applyBrand(doc({ role: "booking", url: "" }), {
      WEBSITE_URL: "https://brand.example",
      CTA_URL: "https://brand.example",
      [destinationTokenKey("booking")]: "https://calendly.example/agent",
    });
    expect(urlOf(out)).toBe("https://calendly.example/agent");
  });

  test("two roles in one doc resolve to two different destinations", () => {
    const d = {
      globalStyle: {},
      blocks: [
        { id: "a", type: "button", props: { role: "community", url: "" } },
        { id: "b", type: "button", props: { role: "booking", url: "" } },
      ],
    } as unknown as EmailDoc;
    const out = applyBrand(d, {
      [destinationTokenKey("community")]: "https://brand.example/hoods",
      [destinationTokenKey("booking")]: "https://calendly.example/agent",
    });
    expect((out.blocks[0]!.props as { url?: string }).url).toBe("https://brand.example/hoods");
    expect((out.blocks[1]!.props as { url?: string }).url).toBe("https://calendly.example/agent");
  });

  // Gmail sender guidelines: "Recipients should know what to expect when they click a
  // link." A homepage cannot honestly answer "about THIS community".
  test("community does NOT silently fall back to the homepage", () => {
    const out = applyBrand(doc({ role: "community", url: "https://engine.example/set" }), {
      WEBSITE_URL: "https://brand.example",
      CTA_URL: "https://brand.example",
    });
    expect(urlOf(out)).toBe("https://engine.example/set");
  });

  test("an unresolved slot is never BLANKED — the engine value stays", () => {
    const out = applyBrand(doc({ role: "listing", url: "https://realtor.example/123" }), {
      WEBSITE_URL: "https://brand.example",
      CTA_URL: "https://brand.example",
    });
    expect(urlOf(out)).toBe("https://realtor.example/123");
  });
});

// ── the brand round-trip ─────────────────────────────────────────────────────
describe("brand blob → tokens → resolver round-trip", () => {
  test("button_destinations reaches applyBrand as BUTTON_DEST_* tokens", () => {
    const branding = {
      website_url: "https://brand.example",
      button_destinations: {
        community: "https://brand.example/neighborhoods",
        booking: "https://calendly.example/agent",
      },
    } as unknown as Record<string, string>;
    const t = brandingToTokens(branding);
    expect(t[destinationTokenKey("community")]).toBe("https://brand.example/neighborhoods");
    expect(t[destinationTokenKey("booking")]).toBe("https://calendly.example/agent");
    expect(savedDestinationsFromTokens(t).community).toBe("https://brand.example/neighborhoods");

    const out = applyBrand(doc({ role: "community", url: "" }), t);
    expect(urlOf(out)).toBe("https://brand.example/neighborhoods");
  });

  // FOUND IN PROD, 08/04/2026, by writing a real destination onto a real profile.
  // A jsonb column does not arrive in one shape: PostgREST parses it to an object,
  // the raw Postgres driver hands back JSON TEXT. The original `typeof === "object"`
  // check silently rejected the string, so every BUTTON_DEST_* token went missing —
  // `community` resolved to an open slot and `booking` wrongly took the homepage.
  // 2,765 green unit tests never saw it because every fixture was already an object.
  test("jsonb arriving as a JSON STRING resolves the same as an object", () => {
    const asString = roleDestinationsFromBrand({
      button_destinations: '{"community":"https://brand.example/hoods"}',
    });
    expect(asString.community).toBe("https://brand.example/hoods");

    const t = brandingToTokens({
      button_destinations: '{"community":"https://brand.example/hoods"}',
    } as unknown as Record<string, string>);
    expect(urlOf(applyBrand(doc({ role: "community", url: "" }), t))).toBe(
      "https://brand.example/hoods",
    );
  });

  test("a malformed JSON string is dropped, never thrown on", () => {
    expect(roleDestinationsFromBrand({ button_destinations: "{not json" })).toEqual({});
  });

  test("a JSON ARRAY is rejected — it is not a role map", () => {
    expect(roleDestinationsFromBrand({ button_destinations: '["https://x.example"]' })).toEqual({});
  });

  test("a junk/unknown role key or blank value in the blob is dropped, never thrown on", () => {
    expect(
      roleDestinationsFromBrand({
        button_destinations: { "not-a-role": "https://x.example", community: "  " },
      }),
    ).toEqual({});
  });

  test("no button_destinations at all is a no-op, not a crash", () => {
    const t = brandingToTokens({ website_url: "https://brand.example" });
    expect(t[destinationTokenKey("community")]).toBeUndefined();
  });
});

// ── the fail-confirm scope ───────────────────────────────────────────────────
// Operator 08/04/2026: "yes, our sends are branded to us, unless we change it
// beforehand." Our own brand website IS swfldatagulf.com, so "user has a brand" alone
// would nag on every house send. The confirm catches a LEAK — a client pointing at US
// while their brand points elsewhere — so it compares HOSTS, not account identity.
describe("swfldatagulf fail-confirm fires on a leak, never on our own branded sends", () => {
  const OURS = "https://www.swfldatagulf.com/z/33990";

  test("our own send does NOT nag — the destination IS our brand website", () => {
    expect(
      needsHouseConfirm({
        url: OURS,
        hasBrand: true,
        brandWebsiteUrl: "https://www.swfldatagulf.com",
      }),
    ).toBe(false);
  });

  test("a client pointing at US while their brand is elsewhere DOES confirm", () => {
    expect(
      needsHouseConfirm({
        url: OURS,
        hasBrand: true,
        brandWebsiteUrl: "https://gulfharbor.example.com",
      }),
    ).toBe(true);
  });

  test("a brandless/house preview never nags", () => {
    expect(needsHouseConfirm({ url: OURS, hasBrand: false })).toBe(false);
  });

  test("an agent's own non-platform destination is never a confirm", () => {
    expect(
      needsHouseConfirm({
        url: "https://gulfharbor.example.com/homes",
        hasBrand: true,
        brandWebsiteUrl: "https://gulfharbor.example.com",
      }),
    ).toBe(false);
  });

  // Unparseable brand website must not silently suppress the confirm — a confirm shown
  // in error costs a click; one skipped in error ships the leak.
  test("a junk brand website still confirms rather than silently passing", () => {
    expect(needsHouseConfirm({ url: OURS, hasBrand: true, brandWebsiteUrl: "not a url" })).toBe(
      true,
    );
    expect(needsHouseConfirm({ url: OURS, hasBrand: true })).toBe(true);
  });

  // A lookalike host that merely CONTAINS our domain is somebody else's site.
  test("a lookalike host is not our platform and not a host match", () => {
    expect(
      needsHouseConfirm({
        url: "https://swfldatagulf.com.evil.co/x",
        hasBrand: true,
        brandWebsiteUrl: "https://www.swfldatagulf.com",
      }),
    ).toBe(false);
  });
});

// ── §3.3 THE POPUP GATE ──────────────────────────────────────────────────────
// "If brand already has a saved destination for that role, NO prompt — that is the
// whole point of saving." The lab runs applyBrand FIRST and audits the result
// (EmailLabGridShell: applyBrand → auditDocLinks), so this pins the pair rather than
// the shell. I had reasoned this was satisfied by ordering; reasoning is not evidence.
describe("popup gating — a saved destination means zero prompts", () => {
  const communityButton = () =>
    doc({ role: "community", label: "Find Out More About This Community", url: "" });

  test("brand HAS the role destination → the build leaves NO link ask", () => {
    const t = brandingToTokens({
      button_destinations: { community: "https://brand.example/hoods" },
    } as unknown as Record<string, string>);
    expect(auditDocLinks(applyBrand(communityButton(), t))).toEqual([]);
  });

  test("brand does NOT have it → the ask survives, so the user is prompted once", () => {
    const asks = auditDocLinks(applyBrand(communityButton(), brandingToTokens({})));
    expect(asks).toHaveLength(1);
    expect(asks[0]!.label).toBe("Find Out More About This Community");
  });

  // The nag case the handoff calls out by name: a website alone must not silence the
  // prompt for a role a homepage cannot honestly answer — but it also must not fire
  // twice. One website, one ask, still exactly one.
  test("a website alone does NOT satisfy a community button", () => {
    const t = brandingToTokens({ website_url: "https://brand.example" });
    expect(auditDocLinks(applyBrand(communityButton(), t))).toHaveLength(1);
  });

  test("primary-cta IS satisfied by the website → no prompt", () => {
    const t = brandingToTokens({ website_url: "https://brand.example" });
    expect(
      auditDocLinks(applyBrand(doc({ role: "primary-cta", label: "View", url: "" }), t)),
    ).toEqual([]);
  });
});

// ── the scheduled lanes ──────────────────────────────────────────────────────
// emaildoc-occurrence.ts and sequence/frozen-occurrence.ts call the link ladder but
// never call applyBrand at all (open defect applybrand_no_server_side_caller). The
// saved-role rung in link-audit is what covers them.
describe("link ladder carries saved role destinations (covers the scheduled lanes)", () => {
  const needy = (role: string) =>
    ({
      globalStyle: {},
      blocks: [{ id: "b1", type: "button", props: { role, label: "Find Out More", url: "" } }],
    }) as unknown as EmailDoc;

  test("saved role destination outranks every generic rung", () => {
    const res = applyLinkFallbacks(needy("community"), {
      listingUrl: "https://listing.example/1",
      brandWebsiteUrl: "https://brand.example",
      hostedUrl: "https://www.swfldatagulf.com/p/abc",
      savedDestinations: { community: "https://brand.example/hoods" },
    });
    expect(urlOf(res.doc)).toBe("https://brand.example/hoods");
    expect(res.applied[0]!.rung).toBe("saved-role");
  });

  test("a saved destination applies even when the generic ladder is EMPTY", () => {
    const res = applyLinkFallbacks(needy("booking"), {
      savedDestinations: { booking: "https://calendly.example/agent" },
    });
    expect(urlOf(res.doc)).toBe("https://calendly.example/agent");
    expect(res.applied[0]!.rung).toBe("saved-role");
  });

  test("no saved destination falls through to the existing generic ladder", () => {
    const res = applyLinkFallbacks(needy("community"), {
      listingUrl: "https://listing.example/1",
      savedDestinations: {},
    });
    expect(urlOf(res.doc)).toBe("https://listing.example/1");
    expect(res.applied[0]!.rung).toBe("listing");
  });

  // A send-time GUESS must never immunize itself against the next brand overlay.
  test("the ladder never stamps urlSource:user on its own guess", () => {
    const res = applyLinkFallbacks(needy("community"), {
      brandWebsiteUrl: "https://brand.example",
      savedDestinations: { community: "https://brand.example/hoods" },
    });
    expect((res.doc.blocks[0]!.props as { urlSource?: string }).urlSource).toBeUndefined();
  });

  test("nothing anywhere leaves the doc untouched rather than writing a dead URL", () => {
    const res = applyLinkFallbacks(needy("listing"), {});
    expect(urlOf(res.doc)).toBe("");
    expect(res.applied).toEqual([]);
  });
});

// ── THE FORCING FUNCTION ─────────────────────────────────────────────────────
// `role` is OPTIONAL in the schema so PERSISTED docs still parse (see ButtonProps in
// doc/types.ts). That means the type system cannot stop a new recipe from shipping a
// roleless button — this scan does instead. A roleless button silently falls back to
// primary-cta, which re-opens the exact global-override bug this build closed.
describe("every button EMITTER declares a role", () => {
  // DERIVED, never hardcoded. A hardcoded list was the first cut and it silently
  // missed a real emitter within the hour: `--untracked` matters because a brand-new
  // recipe is UNTRACKED while it is being written, and a plain `git grep` cannot see
  // it — so the scan would go green over exactly the file most likely to be wrong.
  const emitters = (): string[] =>
    execSync('git grep -l --untracked --no-color "type: \\"button\\"" -- lib/', {
      cwd: REPO,
      encoding: "utf8",
    })
      .split("\n")
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter((s) => s && !s.includes(".test."));

  test("the scan finds the emitters it is supposed to police", () => {
    // A broken grep returning [] would make every assertion below vacuously pass.
    const found = emitters();
    expect(found.length).toBeGreaterThanOrEqual(6);
    // lifecycle-chrome feeds all 7 listing lifecycle recipes and is NOT under
    // lib/deliverable/recipes/ — the handoff enumerated only that directory and
    // missed it entirely. Pinned by name so a future path change cannot drop it.
    expect(found).toContain("lib/email/lifecycle-chrome.ts");
  });

  test('no emitter anywhere ships a roleless `type: "button"`', () => {
    const roleless: string[] = [];
    for (const rel of emitters()) {
      const lines = readFileSync(join(REPO, rel), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/type:\s*"button"/.test(line)) return;
        // The role sits in the same props literal, a short window below.
        if (!/\brole:\s*"/.test(lines.slice(i, i + 14).join("\n"))) {
          roleless.push(`${rel}:${i + 1}`);
        }
      });
    }
    expect(roleless).toEqual([]);
  });
});
