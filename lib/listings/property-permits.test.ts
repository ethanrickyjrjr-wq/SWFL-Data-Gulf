// lib/listings/property-permits.test.ts
//
// Every test is NAMED FOR THE FAILURE MODE it prevents.
// Source reality measured live 08/04/2026 against data_lake.steadyapi_property_permits_v:
// 79,281 permit rows · 12,946 properties · 4 rows with an unparseable-as-sane date.
// DUPLICATES, both keys measured (they differ 14x — do not quote one alone):
//   loose key (property+type+status+date) = 7,274 groups / 12,371 rows (15.6%)
//   every-field key                        =   673 groups /    882 rows (1.1%)
// dedupePermits collapses ONLY the every-field kind.

import { describe, expect, test } from "bun:test";
import {
  dedupePermits,
  permitDateLabel,
  summarizePropertyPermits,
  type PropertyPermitRow,
} from "./property-permits";

function permit(over: Partial<PropertyPermitRow> = {}): PropertyPermitRow {
  return {
    property_id: "6782488671",
    permit_ordinal: 1,
    permit_type: "Re-roof",
    status: "Final",
    project_name: null,
    project_type_1: "Roofing",
    project_type_2: null,
    project_type_3: null,
    effective_date_raw: "2022-06-01",
    effective_date: "2022-06-01",
    ...over,
  };
}

describe("DUPLICATES — 7,274 exact-duplicate groups exist in the source", () => {
  test("an exact duplicate is collapsed so a count cannot be inflated", () => {
    // Property 6782488671 really does carry 'Single family - new home' twice with an
    // identical date and status. Counting raw rows would tell an owner they pulled two
    // permits when they pulled one.
    const rows = [
      permit({ permit_ordinal: 1, permit_type: "Single family - new home" }),
      permit({ permit_ordinal: 2, permit_type: "Single family - new home" }),
      permit({ permit_ordinal: 3, permit_type: "Re-roof" }),
    ];
    expect(dedupePermits(rows)).toHaveLength(2);
  });

  test("same type on a DIFFERENT date is NOT a duplicate — it is a second job", () => {
    const rows = [
      permit({ permit_ordinal: 1, permit_type: "Re-roof", effective_date: "2022-06-01" }),
      permit({ permit_ordinal: 2, permit_type: "Re-roof", effective_date: "2015-03-04" }),
    ];
    expect(dedupePermits(rows)).toHaveLength(2);
  });
});

describe("DATES — 4 source rows carry an absurd future the view already NULLed", () => {
  test("a null parsed date renders NO date — never the raw garbage string", () => {
    // 'Aug 1, 2269' must never reach a reader, and must never be silently turned into
    // today either. The permit itself is still real, so it is kept.
    // effective_date_raw is the UNGUARDED stored date as ISO text, not the vendor's
    // literal "Aug 1, 2269" — the root table does not keep the vendor string (check
    // steadyapi_permits_vendor_date_string_not_stored). Either shape must stay unreadable.
    const p = permit({ effective_date: null, effective_date_raw: "2269-08-01" });
    expect(permitDateLabel(p)).toBeNull();

    const out = summarizePropertyPermits([p]);
    expect(out.permits).toHaveLength(1);
    expect(out.permits[0].dateLabel).toBeNull();
    expect(JSON.stringify(out)).not.toContain("2269");
  });

  test("a real date renders MM/DD/YYYY (rule 2), never ISO", () => {
    expect(permitDateLabel(permit({ effective_date: "2022-06-01" }))).toBe("06/01/2022");
  });
});

describe("ORDER + SHAPE", () => {
  test("newest first, and undated permits sort last rather than vanishing", () => {
    const out = summarizePropertyPermits([
      permit({ permit_ordinal: 1, permit_type: "old", effective_date: "1999-12-17" }),
      permit({ permit_ordinal: 2, permit_type: "undated", effective_date: null }),
      permit({ permit_ordinal: 3, permit_type: "new", effective_date: "2024-01-17" }),
    ]);
    expect(out.permits.map((p) => p.permitType)).toEqual(["new", "old", "undated"]);
  });

  test("empty in, empty out — never throws, never invents", () => {
    const out = summarizePropertyPermits([]);
    expect(out.permits).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.newestDateLabel).toBeNull();
  });
});

describe("SCOPE LAW — listing-scoped, never a county statistic", () => {
  test("the summary carries the listing-scope caveat so no caller can serve it as area-wide", () => {
    // The playbook's binding coverage law: a permit row exists only for a property we
    // probed. A caller must not be able to read this object and say 'permits in Lee County'.
    const out = summarizePropertyPermits([permit()]);
    expect(out.scopeNote.toLowerCase()).toContain("this property");
  });
});

describe("POOL — must NOT become a second pool root", () => {
  test("a 'Pool' permit is reported as a permit, never as a pool-ownership fact", () => {
    // permit_type literally takes the value 'Pool'. The ONE pool root is
    // lee_comp_sales_v.pool. A permit is an EVENT and is listing-scoped.
    const out = summarizePropertyPermits([permit({ permit_type: "Pool" })]);
    expect(out.permits[0].permitType).toBe("Pool");
    // No boolean pool field may exist on this shape at all.
    expect(out).not.toHaveProperty("hasPool");
    expect(out.permits[0]).not.toHaveProperty("hasPool");
  });
});
