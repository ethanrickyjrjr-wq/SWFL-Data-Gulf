// lib/insiders/teaser-split.ts
//
// Cuts the Issue 001 press artifact into the free teaser (spec:
// docs/superpowers/specs/2026-07-26-insiders-issue001-gated-read-design.md).
// Free read = masthead + The Tape + first two Lead paragraphs, then the gate.
// Structure contract (pressed 07/26/2026): <div class="sheet"> wraps the issue;
// <section class="tape"> is The Tape; the following <section> holds
// <div class="lead-body"> whose children are <p> tags. On ANY mismatch this
// returns null — the route then serves lastResortTeaser(). Fail closed: a
// wrong guess here could leak the gated issue, so there are no heuristics.

const GATE_BLOCK = `
<div id="continue" class="gate" style="position:relative;margin-top:-140px;padding-top:180px;background:linear-gradient(to bottom, rgba(10,20,25,0) 0%, #0a1419 140px);">
  <div style="max-width:520px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.10);border-radius:12px;padding:36px 28px;background:#0e1b21;">
    <p style="font-family:'Geist Mono',Consolas,monospace;font-size:12px;letter-spacing:0.34em;text-transform:uppercase;color:#3DC9C0;">The rest is for readers</p>
    <h2 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:34px;line-height:1.1;margin:12px 0 8px;">Keep reading &mdash; free.</h2>
    <p style="color:rgba(237,242,241,0.72);font-size:15px;margin-bottom:20px;">The rest of Issue 001 unlocks with your email. One issue a month, every number sourced.</p>
    <form id="ins-gate-form" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <input type="email" required name="email" placeholder="you@example.com" aria-label="Email address"
        style="flex:1;min-width:220px;padding:12px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:#0a1419;color:#EDF2F1;font-size:15px;">
      <button type="submit"
        style="padding:12px 20px;border-radius:8px;border:0;background:#3DC9C0;color:#0a1419;font-weight:600;font-size:15px;cursor:pointer;">Unlock the issue</button>
    </form>
    <p id="ins-gate-err" hidden style="color:#FF8A70;font-size:13px;margin-top:10px;">Something went wrong. Try again in a moment.</p>
    <p style="color:rgba(237,242,241,0.45);font-size:12px;margin-top:14px;">Free &middot; monthly &middot; unsubscribe anytime. Your email stays on our infrastructure only.</p>
    <noscript><p style="color:rgba(237,242,241,0.72);font-size:13px;margin-top:10px;">JavaScript is off &mdash; subscribe at <a href="/insiders" style="color:#3DC9C0;">swfldatagulf.com/insiders</a> and reload this page.</p></noscript>
  </div>
</div>
<script>
document.getElementById("ins-gate-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var err = document.getElementById("ins-gate-err");
  err.hidden = true;
  var email = new FormData(e.target).get("email");
  try {
    var res = await fetch("/api/insiders/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, source: "issue-001-gate" }),
    });
    if (res.ok) { location.reload(); }
    else { err.hidden = false; }
  } catch (_) { err.hidden = false; }
});
</script>
`;

const CLOSE = "\n</div>\n</section>\n" + GATE_BLOCK + "\n</div>\n</body>\n</html>\n";

export function splitTeaser(fullHtml: string): string | null {
  const tape = fullHtml.indexOf('<section class="tape">');
  if (tape < 0) return null;
  const leadBody = fullHtml.indexOf('<div class="lead-body">', tape);
  if (leadBody < 0) return null;
  // End of the SECOND paragraph inside the lead body.
  const firstP = fullHtml.indexOf("</p>", leadBody);
  if (firstP < 0) return null;
  const secondP = fullHtml.indexOf("</p>", firstP + 4);
  if (secondP < 0) return null;
  const cut = secondP + 4;
  // The cut must land before the lead-body's section closes — if the second
  // </p> we found lives outside this section, the structure has drifted.
  const sectionClose = fullHtml.indexOf("</section>", leadBody);
  if (sectionClose >= 0 && cut > sectionClose) return null;
  return fullHtml.slice(0, cut) + CLOSE;
}

export function lastResortTeaser(): string {
  // Degraded branch: structure drifted, serve the gate with zero issue
  // content rather than risk a leak (spec failure mode #6).
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>The Insiders Edition — Issue No. 001 · SWFL Data Gulf</title>\n" +
    "</head>\n<body style=\"background:#0a1419;color:#EDF2F1;font-family:-apple-system,'Segoe UI',sans-serif;padding:60px 20px;\">\n" +
    GATE_BLOCK +
    "\n</body>\n</html>\n"
  );
}
