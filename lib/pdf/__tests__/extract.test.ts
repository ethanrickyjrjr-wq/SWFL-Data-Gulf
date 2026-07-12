// Writer→reader round-trip: the PDF our own writer emits must be readable by our
// own text-layer reader. This is the behavioural proof that the serverless reader
// actually extracts (the no-eager-pdfjs guard only proves it loads lazily).
import { test, expect } from "bun:test";
import type { EmailDoc } from "@/lib/email/doc/types";
import { renderEmailDocToBuffer, parsePdfText } from "@/lib/pdf";

const DOC: EmailDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "LATO_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [{ id: "t1", type: "text", props: { body: "UNPDFROUNDTRIP sentinel body" } }],
};

test("writer→reader round-trip extracts the text layer", async () => {
  const buf = await renderEmailDocToBuffer(DOC);
  const res = await parsePdfText(buf);
  expect(res).not.toBeNull();
  // Extraction may re-space glyph runs; compare space-stripped.
  expect(res!.text.replace(/\s+/g, "")).toContain("UNPDFROUNDTRIP");
  expect(res!.pages).toBeGreaterThanOrEqual(1);
});

test("garbage bytes → null, no throw", async () => {
  expect(await parsePdfText(new Uint8Array([9, 9, 9, 9]))).toBeNull();
});
