// unattended.mjs — the ONE definition of "no human is in this session".
//
// An OPERATOR_APPROVED_* token is a HUMAN's word. The weekly-dep-scan cloud routine was blocked
// by the push hook on 09/07 + 09/14/2026, set the token on ITSELF, and pushed to main. Every
// guard that honors such a token asks this first; where it returns markers the token is ignored.
//
// Markers are vendor-DOCUMENTED env vars only:
//   CLAUDE_CODE_REMOTE=true — every cloud session, which is what a routine runs as
//     (code.claude.com/docs/en/env-vars, /hooks, /claude-code-on-the-web)
//   CI=true — GitHub Actions default (docs.github.com …/variables)
// NO TTY clause: a hook's stdio is piped in every session — isTTY measured `undefined` in a
// live interactive local session 09/20/2026 — so it would block the operator's own run.
// ponytail: a session that can edit this file can still gut it; the real wall is GitHub's
// ruleset (push) and the vendor-side spend limit (paid runs).
export function unattendedMarkers(env = process.env) {
  return ["CLAUDE_CODE_REMOTE", "CI"].filter((k) => env[k] === "true");
}

export function unattendedRefusal(token, markers) {
  return (
    `${token}=1 in an unattended session (${markers.join(", ")}=true).\n` +
    "That token is the human operator's word; a routine or CI job cannot speak it.\n" +
    "Do not retry, rephrase, or route around this. Report what you wanted to run and stop."
  );
}
