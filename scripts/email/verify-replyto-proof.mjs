// scripts/email/verify-replyto-proof.mjs
//
// FLAG #1 / Step-0 empirical proof for the Buyer-Intent Reply Sensor: does a
// custom per-send `reply_to` survive to delivered mail? The remote build
// container's network policy blocks api.resend.com (`host_not_allowed`), so this
// proof MUST run somewhere with Resend egress (a laptop, or a web env whose
// network policy allows api.resend.com).
//
// Usage (from the repo root, with deps installed):
//   RESEND_API_KEY=re_xxx node scripts/email/verify-replyto-proof.mjs you@gmail.com
//
// It sends ONE real email to the address you pass, carrying
//   reply_to = r-<token>@reply.swfldatagulf.com
// then reads the record back via the API. To finish the proof: open the email,
// "Show original" (Gmail) / "View source", and confirm the delivered
//   Reply-To: r-<token>@reply.swfldatagulf.com
// header is present (NOT the From address). If it is, the broadcast token scheme
// holds. If it is NOT, switch the send path to per-recipient emails.send() (the
// fallback already noted in the plan) — token-per-recipient instead.
//
// No secret is hard-coded; the key is read from RESEND_API_KEY.

import { Resend } from "resend";

const to = process.argv[2];
const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("Set RESEND_API_KEY (a sending-capable Resend key).");
  process.exit(1);
}
if (!to) {
  console.error("Pass a recipient: node scripts/email/verify-replyto-proof.mjs you@example.com");
  process.exit(1);
}

const token = "deadbeef00112233";
const reply = `r-${token}@reply.swfldatagulf.com`;
const from = process.env.PROOF_FROM ?? "SWFL Sensor Proof <onboarding@resend.dev>";

const r = new Resend(key);
const sent = await r.emails.send({
  from,
  to,
  subject: `Reply-To proof — header should read ${reply}`,
  text:
    "FLAG #1 EMPIRICAL PROOF (Buyer-Intent Reply Sensor).\n\n" +
    `This email was sent with reply_to = ${reply}\n\n` +
    "Gmail: 3-dot menu > 'Show original' and confirm the Reply-To: header equals\n" +
    `${reply}  (NOT the From address).\n` +
    "Shortcut: hit Reply and check the To: auto-fills with the r-... address.\n\n" +
    "If the Reply-To survived, a per-send custom reply_to reaches delivered mail\n" +
    "and the sensor's broadcast token scheme holds.\n",
  replyTo: reply,
});

if (sent.error) {
  console.error("SEND FAILED:", JSON.stringify(sent.error, null, 2));
  console.error(
    "\nIf this says host_not_allowed, you're running inside a network-restricted\n" +
      "environment — run it on a machine with normal outbound internet.",
  );
  process.exit(1);
}

console.log("SENT id:", sent.data?.id, "→", to);
console.log("Expected delivered Reply-To:", reply);

await new Promise((s) => setTimeout(s, 2500));
try {
  const got = await r.emails.get(sent.data.id);
  console.log("API readback reply_to:", JSON.stringify(got.data?.reply_to ?? "(none)"));
} catch (e) {
  console.log("(API readback skipped:", e.message, ")");
}
console.log("\nNow open the email and confirm the Reply-To header. That closes Flag #1.");
