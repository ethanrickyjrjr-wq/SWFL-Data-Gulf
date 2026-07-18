#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks any command that would copy, cat, or
// redirect the FULL contents of a dotenv secrets file (.env.local, .env,
// .env.production, ...) anywhere — including this repo's own scratchpad/tmp.
//
// Built 2026-07-18 after a real incident: a subagent dumped the entire
// .env.local (every secret in the project — Stripe live key, a GitHub PAT
// with push access to main, the Supabase service-role key + Postgres
// password, everything) to a plaintext file in /tmp during an unrelated
// research workflow. The sanctioned pattern this repo already uses
// everywhere (`grep '^PHOTOS_API=' .env.local`) reads exactly ONE named
// variable and is always allowed; anything broader is blocked.
//
// What it BLOCKS:
//   • cp / copy / install with a dotenv file as source
//   • cat <dotenv file>                       (full-file dump)
//   • any redirect (`>`, `>>`, `tee`) writing a dotenv file's content out,
//     unless the same logical command also narrows to ONE specific
//     ^VARNAME= line via grep/awk (the sanctioned pattern)
//
// What it ALLOWS (never a false positive on normal work):
//   • grep '^VARNAME=' .env.local | cut ...          (the sanctioned pattern,
//     used throughout this repo's own scripts and CLAUDE.md examples)
//   • awk -F= '/^VARNAME=/{print $2}' .env.local
//   • ls / find / wc / stat / test -f / [ -f ... ] on a dotenv file
//     (metadata only, never exposes content)
//   • .env.example (committed template, no real secrets, never guarded)
//   • everything that doesn't reference a dotenv file at all
//
// ESCAPE HATCH — deliberate operator need (e.g. the operator's own `!`
// command wants to view/back up the file): prefix with ALLOW_ENV_FULL_READ=1.
// This guard is for the agent's default reflex, not an absolute wall.
//
// Fail-OPEN on any internal error — a broken guard must never wedge the agent.

const BANNER = "=".repeat(72);

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = String(JSON.parse(raw || "{}")?.tool_input?.command ?? "");
  } catch {
    process.exit(0); // not our shape — allow
  }
  if (!cmd.trim()) process.exit(0);

  if (/\bALLOW_ENV_FULL_READ=1\b/.test(cmd)) process.exit(0);

  const hit = firstViolation(cmd);
  if (!hit) process.exit(0);

  block(hit);
});

// A dotenv-shaped filename token: .env, .env.local, .env.production, etc.
// Deliberately excludes .env.example (committed template, no real secrets).
const ENV_FILE_RE = /(^|[\\/ "'`])(\.env(?:\.[a-zA-Z0-9_-]+)?)\b/g;

function referencesGuardedEnvFile(seg) {
  const matches = [...seg.matchAll(ENV_FILE_RE)].map((m) => m[2]);
  return matches.some((f) => f !== ".env.example");
}

// A "single named variable" scoping filter: grep/awk anchored to ONE
// specific ^VARNAME= (uppercase identifier, no alternation/wildcard inside).
const SINGLE_VAR_SCOPE_RE = /\b(grep|egrep|awk)\b[^|;&\n]*\^[A-Z_][A-Z0-9_]*=/;

// Metadata-only commands that reference the filename but never expose content.
const METADATA_ONLY_RE = /\b(ls|find|wc|stat|test|file|basename|dirname)\b/;

function firstViolation(cmd) {
  // Split on top-level control-flow separators. Pipes stay INSIDE a segment
  // so a scoping grep later in the same pipeline still counts.
  const segments = cmd.split(/&&|;|\|\|(?!\|)|\n/).map((s) => s.trim());
  for (const seg of segments) {
    if (!seg) continue;
    if (!referencesGuardedEnvFile(seg)) continue;

    // Bare metadata check (ls/find/wc/stat/test/[ -f ]) — never exposes content.
    if (
      METADATA_ONLY_RE.test(seg) &&
      !/\bcat\b|\bcp\b|\bcopy\b|\binstall\b|>{1,2}|\btee\b/.test(seg)
    ) {
      continue;
    }

    // Sanctioned pattern present anywhere in this logical command → allow.
    if (SINGLE_VAR_SCOPE_RE.test(seg)) continue;

    // Otherwise: any cp/copy/install/cat/redirect/tee touching the file → block.
    if (/\b(cp|copy|install|cat|tee)\b/.test(seg) || />{1,2}/.test(seg)) {
      return { seg };
    }

    // Referenced the file, no scoping filter, no obvious read/write verb either
    // (e.g. passed as an arg to some other tool) — block conservatively, since
    // we can't prove it's safe and the whole point is "no reason to touch it
    // wholesale."
    return { seg };
  }
  return null;
}

function block({ seg }) {
  const detail =
    "This command references a dotenv secrets file without the sanctioned\n" +
    "single-variable pattern (`grep '^VARNAME=' .env.local`). A full dump of\n" +
    ".env.local is exactly what caused a real incident on 2026-07-18 — every\n" +
    "secret in the project (Stripe live key, a GitHub push-to-main PAT, the\n" +
    "Supabase service-role key + Postgres password) ended up in a plaintext\n" +
    "/tmp file from a subagent doing this same thing.\n\n" +
    "Read exactly the ONE variable you need instead:\n" +
    "  KEY=$(grep '^VARNAME=' .env.local | cut -d'=' -f2-)\n\n" +
    "If a human operator genuinely needs the full file, re-run with the\n" +
    "explicit opt-in: ALLOW_ENV_FULL_READ=1 <your command>\n\n" +
    `Blocked segment: ${seg}`;
  const msg = `\n${BANNER}\nBLOCKED — dotenv full-file exposure\n${BANNER}\n${detail}\n${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}
