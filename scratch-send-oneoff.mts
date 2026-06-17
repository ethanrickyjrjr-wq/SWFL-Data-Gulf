// scratch-send-oneoff.mts — THROWAWAY one-off test send (NOT committed).
// Renders the SAME grounded email spine the weekly cron uses, for one ZIP, and
// sends it transactionally to a single address with the local send-only RESEND_API_KEY.
// Render-only by default; set SEND=true to actually email.
//
//   bun scratch-send-oneoff.mts                 # render only → writes scratch-email.html
//   SEND=true bun scratch-send-oneoff.mts       # render + send to TEST_TO
//
// Env knobs: TEST_ZIP (default 33931 Fort Myers Beach), TEST_TO (default hello@swfldatagulf.com).

import { Resend } from "resend";
import { buildReportModel, reportSubject } from "@/lib/email/recurring-report";
import { assembleActivationReport } from "@/lib/email/activation/snapshot";
import { renderGroundedReport } from "@/lib/email/grounded-report";
import type { ScheduleRow } from "@/lib/email/scheduler";

const ZIP = process.env.TEST_ZIP ?? "33931";
const TO = process.env.TEST_TO ?? "hello@swfldatagulf.com";
const FROM = "SWFL Data Gulf <hello@swfldatagulf.com>"; // verified domain
const SEND = process.env.SEND === "true";

// buildReportModel only reads id / scope_kind / scope_value off the row.
const row = { id: 0, scope_kind: "zip", scope_value: ZIP } as unknown as ScheduleRow;

console.log(`[oneoff] assembling grounded report for ZIP ${ZIP} …`);
const model = await buildReportModel(row, {
  assembleReport: (scope) => assembleActivationReport(scope),
  log: (line: string) => console.log(line),
});

if (!model) {
  console.error(
    `[oneoff] no grounded content for ZIP ${ZIP} (out of footprint or empty) — aborting.`,
  );
  process.exit(1);
}

const subject = reportSubject(model);
let html = await renderGroundedReport(model, { skin: "email" });
// Transactional send has no Resend managed-unsubscribe token substitution — replace
// the broadcast placeholder so it doesn't render as literal braces in the footer.
html = html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "https://www.swfldatagulf.com");

await Bun.write("scratch-email.html", html);
console.log(`[oneoff] subject: ${subject}`);
console.log(`[oneoff] rendered ${html.length} bytes → scratch-email.html`);

if (!SEND) {
  console.log("[oneoff] render-only (SEND not set). No email sent.");
  process.exit(0);
}

const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("[oneoff] RESEND_API_KEY not set — cannot send.");
  process.exit(1);
}
console.log(`[oneoff] sending to ${TO} from ${FROM} …`);
const resend = new Resend(key);
const { data, error } = await resend.emails.send({ from: FROM, to: TO, subject, html });
if (error) {
  console.error("[oneoff] send failed:", error);
  process.exit(1);
}
console.log(`[oneoff] SENT ✓  resend id: ${data?.id}`);
