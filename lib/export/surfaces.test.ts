// lib/export/surfaces.test.ts
// Guards: failure mode 6 (internal-column leak — enforced GENERICALLY over
// every registry entry so a future surface can't regress it) and failure
// mode 9 (attribs column explosion — union capped at 50, alphabetical).
import { describe, expect, test } from "bun:test";
import {
  ATTRIBS_UNION_CAP,
  BANNED_EXPORT_KEYS,
  BANNED_KEY_PATTERN,
  EXPORT_SURFACES,
  attribsUnionColumns,
} from "./surfaces";

describe("export surface registry", () => {
  test("FM6: no surface whitelists a banned or token/hash-shaped column", () => {
    for (const [name, def] of Object.entries(EXPORT_SURFACES)) {
      for (const col of def.columns) {
        expect(BANNED_EXPORT_KEYS.has(col.key), `${name}.${col.key}`).toBe(false);
        expect(BANNED_KEY_PATTERN.test(col.key), `${name}.${col.key}`).toBe(false);
      }
    }
  });

  test("every surface has a stable unique order (created_at, id)", () => {
    for (const def of Object.values(EXPORT_SURFACES)) {
      expect(def.orderCols).toEqual(["created_at", "id"]);
    }
  });

  test("v1 surfaces are exactly contacts and listings, tables as specced", () => {
    expect(Object.keys(EXPORT_SURFACES).sort()).toEqual(["contacts", "listings"]);
    expect(EXPORT_SURFACES.contacts.table).toBe("contacts");
    expect(EXPORT_SURFACES.listings.table).toBe("user_listings");
    expect(EXPORT_SURFACES.listings.withAttribsUnion).toBe(true);
  });

  test("FM9: attribs union caps at 50 keys, alphabetical, ignores non-object attribs", () => {
    const rows = [
      {
        attribs: Object.fromEntries(
          Array.from({ length: 60 }, (_, i) => [`k${String(i).padStart(2, "0")}`, "v"]),
        ),
      },
      { attribs: null },
      { attribs: "not-an-object" },
      { attribs: ["not", "a", "record"] },
    ];
    const cols = attribsUnionColumns(rows);
    expect(cols.length).toBe(ATTRIBS_UNION_CAP);
    const headers = cols.map((c) => c.header);
    expect(headers).toEqual([...headers].sort());
    expect(cols[0]).toEqual({ key: "attribs.k00", header: "k00" });
  });

  test("attribs union is deterministic regardless of row order", () => {
    const a = [{ attribs: { b: 1, a: 1 } }, { attribs: { c: 1 } }];
    const b = [{ attribs: { c: 1 } }, { attribs: { a: 1, b: 1 } }];
    expect(attribsUnionColumns(a)).toEqual(attribsUnionColumns(b));
  });
});
