// PREVIEW SEND — put a rendered email in a real inbox, via Resend.
//
//   bun --env-file=.env.local scripts/email/send-test.mts                      (the 33908 digest)
//   bun --env-file=.env.local scripts/email/send-test.mts <file.html> "<subject>"
//   TEST_TO=you@example.com bun --env-file=.env.local scripts/email/send-test.mts …
//
// PARAMETERIZED 08/06/2026 (§1.19 T3 — a parameter is not duplication). It used to hardcode
// ONE file and ONE subject, so putting an acceptance render in an inbox meant either editing
// this file or writing a second sender. Both defaults are unchanged, so the no-argument
// invocation still does exactly what it always did.
//
// **VERIFY A SEND AGAINST THE INBOX, NEVER AGAINST THIS SCRIPT'S OWN RECORD OF HAVING SENT
// IT** (email map §7). A returned id means Resend accepted it, not that it landed.
import { Resend } from "resend";
import fs from "node:fs";
import path from "node:path";

const fileArg = process.argv[2];
const html = fs.readFileSync(
  fileArg ? path.resolve(fileArg) : path.join(import.meta.dirname, "test-send-33908.html"),
  "utf-8",
);
const to = process.env.TEST_TO ?? "ethanrickyjrjr@gmail.com";
const subject = process.argv[3] ?? "33908 right now — you've got room to negotiate";
const unsub = "https://www.swfldatagulf.com/unsubscribe?token=preview";

if (!process.env.RESEND_API_KEY) {
  console.error("[send-test] RESEND_API_KEY not set");
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);
const res = await resend.emails.send({
  from: "SWFL Data Gulf <hello@swfldatagulf.com>",
  to: [to],
  subject,
  html,
  headers: {
    "List-Unsubscribe": `<${unsub}>, <mailto:unsubscribe@swfldatagulf.com?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
});

console.log(JSON.stringify(res, null, 2));
if (res.error) {
  console.error(`[send-test] FAILED → ${to}`);
  process.exit(1);
}
console.log(`[send-test] SENT → ${to} · id ${res.data?.id} · ${html.length} bytes`);
