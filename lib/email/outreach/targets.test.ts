import { describe, expect, it } from "bun:test";
import { parseTargetsCsv } from "./targets";

describe("parseTargetsCsv", () => {
  it("parses a headered CSV in any column order", () => {
    const { rows, errors } = parseTargetsCsv(
      "name,email,zip,domain\nAcme Realty,broker@acme.com,33931,https://www.acme.com/about\n",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { email: "broker@acme.com", name: "Acme Realty", domain: "acme.com", zip: "33931" },
    ]);
  });

  it("treats the first row as DATA when it is not all known columns", () => {
    const { rows } = parseTargetsCsv("broker@acme.com,Acme,acme.com,33901\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("broker@acme.com");
    expect(rows[0].zip).toBe("33901");
  });

  it("lowercases emails and dedupes them", () => {
    const { rows, errors } = parseTargetsCsv("email\nBroker@Acme.com\nbroker@acme.com\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("broker@acme.com");
    expect(errors[0].reason).toContain("duplicate");
  });

  it("flags invalid emails and invalid zips with 1-based line numbers", () => {
    const { rows, errors } = parseTargetsCsv(
      "email,zip\nnot-an-email,33931\ngood@x.com,abcde\nok@y.com,33901\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("ok@y.com");
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(2);
    expect(errors[0].reason).toContain("invalid email");
    expect(errors[1].line).toBe(3);
    expect(errors[1].reason).toContain("invalid zip");
  });

  it("handles quoted fields containing commas", () => {
    const { rows } = parseTargetsCsv('email,name\nbroker@acme.com,"Acme, Realty & Co"\n');
    expect(rows[0].name).toBe("Acme, Realty & Co");
  });

  it("skips blank lines and tolerates a missing optional column", () => {
    const { rows, errors } = parseTargetsCsv("email\n\nbroker@acme.com\n\n");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].zip).toBeUndefined();
    expect(rows[0].domain).toBeUndefined();
  });
});

// ── demo columns: track / primary / accent / logo ──────────────────────────

it("demo columns parse: track, brand overrides, logo", () => {
  const { rows, errors } = parseTargetsCsv(
    "email,name,domain,zip,track,primary,accent,logo\n" +
      "dana@x.com,Dana,bhhsfloridarealty.com,34103,agent,#670038,#ab8f40,https://cdn.x.com/l.svg\n" +
      "boss@y.com,Pat,premiersothebysrealty.com,34102,broker,,,\n",
  );
  expect(errors).toEqual([]);
  expect(rows[0]).toEqual({
    email: "dana@x.com",
    name: "Dana",
    domain: "bhhsfloridarealty.com",
    zip: "34103",
    track: "agent",
    primary: "#670038",
    accent: "#ab8f40",
    logo: "https://cdn.x.com/l.svg",
  });
  expect(rows[1].track).toBe("broker");
  expect(rows[1].primary).toBeUndefined();
});

it("invalid track / hex / logo produce per-line errors", () => {
  const { rows, errors } = parseTargetsCsv(
    "email,track,primary,logo\n" +
      "a@x.com,realtor,#670038,https://x.com/l.png\n" +
      "b@x.com,agent,purple,https://x.com/l.png\n" +
      "c@x.com,agent,#670038,ftp://x.com/l.png\n",
  );
  expect(rows).toEqual([]);
  expect(errors).toHaveLength(3);
  expect(errors[0].reason).toContain("track");
  expect(errors[1].reason).toContain("primary");
  expect(errors[2].reason).toContain("logo");
});

it("legacy 4-column CSV still parses with no demo fields", () => {
  const { rows, errors } = parseTargetsCsv("a@x.com,Ann,x.com,33901\n");
  expect(errors).toEqual([]);
  expect(rows[0]).toEqual({ email: "a@x.com", name: "Ann", domain: "x.com", zip: "33901" });
});
