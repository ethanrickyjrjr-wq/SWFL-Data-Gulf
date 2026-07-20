import { describe, it, expect } from "bun:test";
import type { User } from "@supabase/supabase-js";
import {
  NAV_GROUPS,
  ACCOUNT_MENU,
  SHELL_HIDDEN_PREFIXES,
  isHiddenPath,
  homeHref,
  isActive,
  isItemActive,
  activeChildHref,
  type NavItem,
} from "./nav-config";

/**
 * Pure nav-config logic — the cross-build seam B1 exposes (and B2/B4/B5 extend).
 * The shell component itself is client/motion/scroll and not unit-tested here; these
 * guard the deterministic contract: which paths get chrome, which tab is active, and
 * where the logo points.
 */

describe("isHiddenPath (shell + footer suppression)", () => {
  it("hides the white-label + auth prefixes", () => {
    expect(isHiddenPath("/p/abc123")).toBe(true);
    expect(isHiddenPath("/embed/charts")).toBe(true);
    expect(isHiddenPath("/login")).toBe(true);
    expect(isHiddenPath("/auth/auth-code-error")).toBe(true);
  });
  it("does NOT hide home — it renders the home variant now", () => {
    expect(isHiddenPath("/")).toBe(false);
  });
  it("does NOT let /p/ match /privacy or /project (trailing-slash guard)", () => {
    expect(isHiddenPath("/privacy")).toBe(false);
    expect(isHiddenPath("/project")).toBe(false);
    expect(isHiddenPath("/project/abc123")).toBe(false);
  });
  it("shows the app surfaces", () => {
    expect(isHiddenPath("/r")).toBe(false);
    expect(isHiddenPath("/charts")).toBe(false);
    expect(isHiddenPath("/showcase")).toBe(false);
  });
  it("treats a null path as hidden (nothing to render against)", () => {
    expect(isHiddenPath(null)).toBe(true);
  });
  it("keeps the /p/ rule in the set (parity twin of pill-mount)", () => {
    expect(SHELL_HIDDEN_PREFIXES).toContain("/p/");
  });
});

describe("isActive (tab highlight)", () => {
  it("matches a tab on its own path and under it", () => {
    expect(isActive("/r", "/r")).toBe(true);
    expect(isActive("/r/env-swfl", "/r")).toBe(true);
    expect(isActive("/project/abc", "/project")).toBe(true);
  });
  it("does NOT match a sibling that merely shares a prefix", () => {
    expect(isActive("/report", "/r")).toBe(false);
    expect(isActive("/rsomething", "/r")).toBe(false);
  });
  it("only lights home on an exact /", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/charts", "/")).toBe(false);
  });
  it("is false for a null path", () => {
    expect(isActive(null, "/r")).toBe(false);
  });
});

describe("homeHref (B4 — signed-in home base)", () => {
  it("sends a logged-OUT visitor to the marketing funnel", () => {
    expect(homeHref(null)).toBe("/");
  });
  it("sends a signed-IN user to their /project home base", () => {
    expect(homeHref({ id: "u1" } as User)).toBe("/project");
  });
});

describe("NAV_GROUPS (primary nav — grouped in B2, Charts/Maps folded back in 07/20)", () => {
  it("carries the top-level marquees + Explore + Seller Tools groups in order", () => {
    // The 07/11 pinned marquee run (Insiders…Alerts) stays CONTIGUOUS — Seller Tools
    // rides after it, never wedged inside it (operator correction 07/19). Charts + Maps
    // moved OUT of the marquee run and into Explore on 07/20 (bar was cramped: wrapped
    // logo, squeezed New Campaign pill).
    expect(NAV_GROUPS.map((n) => n.label)).toEqual([
      "Explore",
      "Insiders",
      "Desk",
      "Showcase",
      "Projects",
      "Alerts",
      "Seller Tools",
    ]);
  });

  it("exposes Insiders as a top-level leaf at /insiders (campaign centerpiece)", () => {
    const insiders = NAV_GROUPS.find((n) => n.label === "Insiders");
    expect(insiders?.href).toBe("/insiders");
    expect(insiders?.children).toBeUndefined();
  });
  it("carries every non-marquee surface under Explore (07/20: Charts/Maps folded back in, orphaned /r/ + marketing pages added)", () => {
    const explore = NAV_GROUPS.find((n) => n.label === "Explore");
    expect(explore?.children?.map((c) => c.href)).toEqual([
      "/r",
      "/charts",
      "/map",
      "/r/housing-swfl",
      "/guides",
      "/ask",
      "/demo",
    ]);
  });
  it("promotes the seller reads to a top-level Seller Tools group (operator ruling 07/18, Offer Check added 07/20)", () => {
    const seller = NAV_GROUPS.find((n) => n.label === "Seller Tools");
    expect(seller?.href).toBeUndefined();
    expect(seller?.children?.map((c) => c.href)).toEqual([
      "/r/should-i-sell",
      "/r/back-on-market",
      "/r/offer-check",
    ]);
  });
  it("no longer exposes Charts or Maps as top-level leaves (folded into Explore 07/20)", () => {
    expect(NAV_GROUPS.find((n) => n.label === "Charts")).toBeUndefined();
    expect(NAV_GROUPS.find((n) => n.label === "Maps")).toBeUndefined();
  });
  it("exposes Desk as a top-level leaf at /desk (live market terminal)", () => {
    const desk = NAV_GROUPS.find((n) => n.label === "Desk");
    expect(desk?.href).toBe("/desk");
    expect(desk?.children).toBeUndefined();
  });
  it("does NOT surface /data-intel anywhere (internal-only, B6)", () => {
    const allHrefs = (item: NavItem): string[] => [
      ...(item.href ? [item.href] : []),
      ...(item.children ?? []).flatMap(allHrefs),
    ];
    const everyHref = NAV_GROUPS.flatMap(allHrefs);
    expect(everyHref).not.toContain("/data-intel");
  });
  it("every LEAF has a label and an absolute href; every GROUP has children", () => {
    const check = (item: NavItem) => {
      expect(item.label.length).toBeGreaterThan(0);
      if (item.children?.length) {
        item.children.forEach(check);
      } else {
        expect(item.href?.startsWith("/")).toBe(true);
      }
    };
    NAV_GROUPS.forEach(check);
  });
});

describe("isItemActive (group lights when any child is active)", () => {
  const explore = NAV_GROUPS.find((n) => n.label === "Explore")!;
  const desk = NAV_GROUPS.find((n) => n.label === "Desk")!;
  it("lights Explore on any of its children", () => {
    expect(isItemActive("/r", explore)).toBe(true);
    expect(isItemActive("/r/env-swfl", explore)).toBe(true);
  });
  it("lights Explore on /guides (new child)", () => {
    expect(isItemActive("/guides", explore)).toBe(true);
    expect(isItemActive("/guides/sourced-numbers", explore)).toBe(true);
  });
  it("lights Explore on Charts/Maps (folded back in 07/20, no longer top-level)", () => {
    expect(isItemActive("/charts", explore)).toBe(true);
    expect(isItemActive("/map", explore)).toBe(true);
  });
  it("does NOT light Explore on a marquee route or an unrelated path", () => {
    expect(isItemActive("/project/abc", explore)).toBe(false);
    expect(isItemActive("/desk", explore)).toBe(false);
  });
  it("lights a leaf marquee on its own path", () => {
    expect(isItemActive("/desk", desk)).toBe(true);
    expect(isItemActive("/r", desk)).toBe(false);
  });
  it("is false for a null path", () => {
    expect(isItemActive(null, explore)).toBe(false);
  });
});

describe("activeChildHref (longest match wins in the dropdown)", () => {
  const children = NAV_GROUPS.find((n) => n.label === "Explore")!.children!;
  it("lights Search on any report path under /r", () => {
    expect(activeChildHref("/r", children)).toBe("/r");
    expect(activeChildHref("/r/env-swfl", children)).toBe("/r");
  });
  it("lights Guides on any guide article", () => {
    expect(activeChildHref("/guides", children)).toBe("/guides");
    expect(activeChildHref("/guides/email-design", children)).toBe("/guides");
  });
  it("lights Charts/Maps now that they're Explore children (folded back in 07/20)", () => {
    expect(activeChildHref("/charts", children)).toBe("/charts");
    expect(activeChildHref("/map", children)).toBe("/map");
  });
  it("returns null when nothing under Explore matches", () => {
    expect(activeChildHref("/desk", children)).toBe(null);
    expect(activeChildHref(null, children)).toBe(null);
  });
  // The longest-match tiebreak is the whole reason this helper exists. Explore
  // currently holds one child, so assert the tiebreak on a local fixture — that
  // keeps it covered if a child under /r/* (e.g. a future ZIP Reports) returns,
  // so it can't double-light Search.
  it("picks the LONGEST matching child href", () => {
    const multi: NavItem[] = [
      { label: "Search", href: "/r" },
      { label: "ZIP Reports", href: "/r/search" },
    ];
    expect(activeChildHref("/r/search", multi)).toBe("/r/search");
    expect(activeChildHref("/r/env-swfl", multi)).toBe("/r");
  });
});

describe("ACCOUNT_MENU (account dropdown contract)", () => {
  it("carries the exact quick-access set, in order", () => {
    expect(ACCOUNT_MENU.map((i) => [i.label, i.href])).toEqual([
      ["My Projects", "/project"],
      ["Brand", "/account/brand"],
      ["Contacts", "/contacts"],
      ["Email Schedule", "/account/schedules"],
      ["Alerts", "/alerts"],
      ["MLS Settings", "/settings/mls"],
      ["Billing", "/billing"],
    ]);
  });
  it("marks ONLY Brand as reveal-capable", () => {
    expect(ACCOUNT_MENU.filter((i) => i.reveal).map((i) => i.label)).toEqual(["Brand"]);
    expect(ACCOUNT_MENU.find((i) => i.label === "Brand")?.reveal).toBe("brand");
  });
});
