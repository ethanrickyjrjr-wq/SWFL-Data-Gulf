import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { parseContactsCsv } from "../parse-contacts-csv.ts";

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

describe("header detection", () => {
  test("skips leading blank lines before header", () => {
    const csv = "\n\nemail,name\nfoo@example.com,Foo\n";
    const { rows, skippedCount } = parseContactsCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, "foo@example.com");
    assert.equal(skippedCount, 0);
  });

  test("returns empty result when csv is all blank", () => {
    const { rows, skippedCount } = parseContactsCsv("   \n  \n");
    assert.equal(rows.length, 0);
    assert.equal(skippedCount, 0);
  });

  test("returns empty result when no email column in header", () => {
    const csv = "name,phone\nFoo,123\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Basic parsing
// ---------------------------------------------------------------------------

describe("basic row parsing", () => {
  test("parses email-only header", () => {
    const csv = "email\nfoo@bar.com\nbaz@qux.io\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].email, "foo@bar.com");
    assert.equal(rows[0].name, null);
    assert.deepEqual(rows[0].tags, []);
  });

  test("parses email + name", () => {
    const csv = "email,name\nfoo@bar.com,Alice\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].name, "Alice");
  });

  test("treats empty name cell as null", () => {
    const csv = "email,name\nfoo@bar.com,\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].name, null);
  });

  test("lowercases email", () => {
    const csv = "email\nFOO@BAR.COM\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].email, "foo@bar.com");
  });

  test("skips rows with empty email", () => {
    const csv = "email,name\n,Alice\nfoo@bar.com,Bob\n";
    const { rows, skippedCount } = parseContactsCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(skippedCount, 1);
  });

  test("skips blank data lines", () => {
    const csv = "email\nfoo@bar.com\n\nbaz@qux.io\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Tag parsing — per-row and body-level
// ---------------------------------------------------------------------------

describe("tag parsing", () => {
  test("parses semicolon-separated tags from cell", () => {
    const csv = "email,tags\nfoo@bar.com,alpha;beta;gamma\n";
    const { rows } = parseContactsCsv(csv);
    assert.deepEqual(rows[0].tags, ["alpha", "beta", "gamma"]);
  });

  test("parses pipe-separated tags from cell", () => {
    const csv = "email,tags\nfoo@bar.com,alpha|beta\n";
    const { rows } = parseContactsCsv(csv);
    assert.deepEqual(rows[0].tags, ["alpha", "beta"]);
  });

  test("lowercases and trims tags", () => {
    const csv = "email,tags\nfoo@bar.com,  ALPHA ; beta  \n";
    const { rows } = parseContactsCsv(csv);
    assert.deepEqual(rows[0].tags, ["alpha", "beta"]);
  });

  test("bodyTags applied to every row", () => {
    const csv = "email\nfoo@bar.com\nbaz@qux.io\n";
    const { rows } = parseContactsCsv(csv, ["newsletter"]);
    assert.deepEqual(rows[0].tags, ["newsletter"]);
    assert.deepEqual(rows[1].tags, ["newsletter"]);
  });

  test("merges body tags with per-row tags, deduplicates", () => {
    const csv = "email,tags\nfoo@bar.com,newsletter;vip\n";
    const { rows } = parseContactsCsv(csv, ["newsletter", "import-2026"]);
    // newsletter appears in both — should appear only once
    const tags = rows[0].tags;
    assert.equal(tags.filter((t) => t === "newsletter").length, 1);
    assert.ok(tags.includes("vip"));
    assert.ok(tags.includes("import-2026"));
  });

  test("empty tags cell produces no per-row tags", () => {
    const csv = "email,tags\nfoo@bar.com,\n";
    const { rows } = parseContactsCsv(csv);
    assert.deepEqual(rows[0].tags, []);
  });
});

// ---------------------------------------------------------------------------
// Quoted field handling
// ---------------------------------------------------------------------------

describe("quoted fields", () => {
  test("quoted field containing comma", () => {
    const csv = 'email,name\nfoo@bar.com,"Smith, John"\n';
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].name, "Smith, John");
  });

  test("escaped double-quote inside quoted field", () => {
    const csv = 'email,name\nfoo@bar.com,"O""Brien"\n';
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].name, 'O"Brien');
  });

  test("quoted email field", () => {
    const csv = 'email\n"foo@bar.com"\n';
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].email, "foo@bar.com");
  });
});

// ---------------------------------------------------------------------------
// Windows-style CRLF line endings
// ---------------------------------------------------------------------------

describe("line ending normalisation", () => {
  test("handles CRLF line endings", () => {
    const csv = "email,name\r\nfoo@bar.com,Alice\r\nbaz@qux.io,Bob\r\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].email, "foo@bar.com");
    assert.equal(rows[0].name, "Alice");
  });

  test("handles old-Mac CR-only line endings", () => {
    const csv = "email,name\rfoo@bar.com,Alice\rbaz@qux.io,Bob\r";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Column order independence
// ---------------------------------------------------------------------------

describe("column order independence", () => {
  test("name before email", () => {
    const csv = "name,email\nAlice,foo@bar.com\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].email, "foo@bar.com");
    assert.equal(rows[0].name, "Alice");
  });

  test("tags before email", () => {
    const csv = "tags,name,email\nnewsletter,Alice,foo@bar.com\n";
    const { rows } = parseContactsCsv(csv);
    assert.equal(rows[0].email, "foo@bar.com");
    assert.deepEqual(rows[0].tags, ["newsletter"]);
  });
});
