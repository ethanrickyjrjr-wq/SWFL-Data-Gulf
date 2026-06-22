import { describe, it, expect } from "bun:test";
import { emailDeliverableScope } from "./email-scope";
import type { ProjectItem } from "@/lib/project/items";

const base = { id: "x", added_at: "2026-06-10T08:00:00Z", origin: "web" as const };

function metric(report_id: string): ProjectItem {
  return {
    ...base,
    kind: "metric",
    report_id,
    label: "Annual flood loss",
    value: "$30,074/yr",
    freshness_token: "SWFL-7421-v5-20260610",
  };
}

describe("emailDeliverableScope", () => {
  it("derives the project's ZIP scope for an email when an item grounds a ZIP", () => {
    expect(emailDeliverableScope([metric("33931")])).toEqual({
      scope_kind: "zip",
      scope_value: "33931",
    });
  });

  it("derives a place scope when an item names a place but no ZIP", () => {
    const placeNote: ProjectItem = { ...base, kind: "note", text: "Notes on Cape Coral inventory" };
    expect(emailDeliverableScope([placeNote])).toEqual({
      scope_kind: "place",
      scope_value: "Cape Coral",
    });
  });

  it("returns null (whole-region) when no item names a ZIP or place — the caller builds a SWFL read, NOT a refusal", () => {
    expect(emailDeliverableScope([{ ...base, kind: "note", text: "misc" }])).toBeNull();
    expect(emailDeliverableScope([])).toBeNull();
  });

  it("a bare brain slug grounds neither a ZIP nor a place → null (whole-region)", () => {
    expect(emailDeliverableScope([metric("rentals-swfl")])).toBeNull();
  });
});
