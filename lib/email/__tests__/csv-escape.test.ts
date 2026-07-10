import { describe, test, expect } from "bun:test";
import { escapeCsvCell, toCsvLine } from "../csv-escape";

/**
 * Pinned CSV/formula-injection policy (check `contacts_csv_injection_policy`):
 * store raw, escape at exit. These vectors — including the two worked examples
 * from OWASP's CSV Injection page — pin the exit shape any future exporter
 * inherits by calling escapeCsvCell/toCsvLine.
 */

describe("escapeCsvCell", () => {
  test("plain values are quoted, unchanged inside", () => {
    expect(escapeCsvCell("Ricky Cooper")).toBe('"Ricky Cooper"');
    expect(escapeCsvCell("buyer@example.com")).toBe('"buyer@example.com"');
    expect(escapeCsvCell("")).toBe('""');
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(undefined)).toBe('""');
  });

  test("formula triggers at position 0 get a leading single quote", () => {
    expect(escapeCsvCell("=1+2")).toBe('"\'=1+2"');
    expect(escapeCsvCell("+55 11 9999")).toBe('"\'+55 11 9999"');
    expect(escapeCsvCell("-Rick")).toBe('"\'-Rick"');
    expect(escapeCsvCell("@handle")).toBe('"\'@handle"');
    expect(escapeCsvCell("\t=cmd")).toBe('"\'\t=cmd"');
    expect(escapeCsvCell("\r=cmd")).toBe('"\'\r=cmd"');
    expect(escapeCsvCell("\n=cmd")).toBe('"\'\n=cmd"');
  });

  test("full-width formula triggers (＝＋－＠) are neutralized too", () => {
    expect(escapeCsvCell("＝1+2")).toBe('"\'＝1+2"');
    expect(escapeCsvCell("＋1")).toBe('"\'＋1"');
    expect(escapeCsvCell("－1")).toBe('"\'－1"');
    expect(escapeCsvCell("＠x")).toBe('"\'＠x"');
  });

  test("OWASP worked example 1: quote-breakout mid-value cannot start a cell", () => {
    expect(escapeCsvCell('=1+2";=1+2')).toBe('"\'=1+2"";=1+2"');
  });

  test("OWASP worked example 2: mixed quotes and separators stay one cell", () => {
    expect(escapeCsvCell("=1+2'\" ;,=1+2")).toBe('"\'=1+2\'"" ;,=1+2"');
  });

  test("a trigger NOT at position 0 is left alone (value is already text)", () => {
    expect(escapeCsvCell("Acme = Best Realty")).toBe('"Acme = Best Realty"');
  });

  test("embedded separators and quotes are contained by quoting", () => {
    expect(escapeCsvCell("Acme, Realty & Co")).toBe('"Acme, Realty & Co"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });
});

describe("toCsvLine", () => {
  test("joins escaped cells with commas, no trailing newline", () => {
    expect(toCsvLine(["a@x.com", "=SUM(A1)", null])).toBe('"a@x.com","\'=SUM(A1)",""');
  });
});
