import { describe, expect, it } from "bun:test";
import { parseContactsCsv } from "./parse-contacts-csv";

describe("parseContactsCsv — attribs", () => {
  it("captures unrecognised columns into attribs, keyed by lowercased header", () => {
    const csv = "email,name,tags,city,budget\nalice@x.com,Alice,buyer,Naples,450000\n";
    const { rows } = parseContactsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].attribs).toEqual({ city: "Naples", budget: "450000" });
  });

  it("omits empty-valued attrib cells", () => {
    const csv = "email,city\nalice@x.com,\n";
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].attribs).toEqual({});
  });

  it("rows with no extra columns get an empty attribs object", () => {
    const csv = "email,name\nalice@x.com,Alice\n";
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].attribs).toEqual({});
  });
});
