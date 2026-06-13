/**
 * Shared harness for the live-DB parity / view-equivalence tests
 * (zhvi/zori `*-gate-a-parity` + `*-view-equivalence`). Consolidates the four
 * once-duplicated copies of dbUri / pythonBin / runPy and the skip gate, with two
 * deliberate behavior fixes baked in:
 *
 *   1. dbUri() reads an explicit env DSN FIRST, then falls back to
 *      .dlt/secrets.toml. The gated CI job injects DESTINATION__POSTGRES__CREDENTIALS
 *      (a `postgresql://…` DSN); the old file-only parser left runnable=false there,
 *      so the fail-loud branch reddened every gated run. Env-first fixes that.
 *
 *   2. gateDescribe is OPT-IN + FAIL-LOUD:
 *        • RUN_DB_PARITY unset → describe.skip with an EMPTY body. This is the
 *          DEFAULT everywhere (local `bun test`, PR CI) → zero psycopg subprocesses,
 *          zero DB connects, no Supabase slot pressure. (describe.skip STILL invokes
 *          its body, and these bodies do live fetches at collection time that THROW
 *          rather than skip — so the body must never be touched when not running.)
 *        • RUN_DB_PARITY=1 + usable creds+python → RUN.
 *        • RUN_DB_PARITY=1 but creds/python missing → a single FAILING test, never a
 *          silent green. "Green" must mean "ran", not "skipped".
 *
 * Serialization is inherent: `bun test` runs all tests in one process, sequentially
 * by default, and the gated job runs ONE `bun test <4 paths>` invocation and never
 * passes --concurrent — so the psycopg connects are already serialized. No mutex.
 *
 * Run under `bun test` (Bun aliases the "vitest" import to bun:test); this module is
 * a helper (leading `_`, no `.test.`), so the runner never collects it directly.
 */
import { describe, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECRETS = path.join(REPO_ROOT, ".dlt", "secrets.toml");

let _uri: string | null | undefined;
/** Resolve a Postgres DSN: explicit env DSN first, then .dlt/secrets.toml. Memoized. */
export function dbUri(): string | null {
  if (_uri !== undefined) return _uri;
  _uri = resolveDbUri();
  return _uri;
}

function resolveDbUri(): string | null {
  // (1) Explicit DSN from the env — the gated CI job sets this. Confirmed a
  //     `postgresql://…` conninfo string (docs/BRAIN_PLATFORM_AUTOMATION_GUIDE.md;
  //     scripts/verify_data_requests.py passes it straight to psycopg).
  const env = process.env.DESTINATION__POSTGRES__CREDENTIALS;
  if (env && /^postgres(ql)?:\/\//.test(env)) return env;
  // (2) Fallback — parse the local dev secrets file.
  if (!existsSync(SECRETS)) return null;
  const toml = readFileSync(SECRETS, "utf-8");
  const block = toml.split("[destination.postgres.credentials]")[1];
  if (!block) return null;
  const grab = (k: string) => block.match(new RegExp(`${k}\\s*=\\s*"([^"]+)"`))?.[1];
  const pw = grab("password");
  const host = grab("host");
  const port = grab("port") ?? "5432";
  const db = grab("database") ?? "postgres";
  const user = grab("username") ?? "postgres";
  if (!pw || !host) return null;
  return `postgresql://${user}:${pw}@${host}:${port}/${db}`;
}

let _py: string | null | undefined;
/** First python on PATH that can `import psycopg`, or null. Memoized (one spawn). */
export function pythonBin(): string | null {
  if (_py !== undefined) return _py;
  _py = (() => {
    for (const bin of ["python", "python3", "py"]) {
      const r = spawnSync(bin, ["-c", "import psycopg"], { encoding: "utf-8" });
      if (r.status === 0) return bin;
    }
    return null;
  })();
  return _py;
}

/** Run a python snippet that dumps JSON to `out_path`; return the parsed JSON. */
export function runPy<T>(py: string, uri: string, body: string): T {
  const dir = mkdtempSync(path.join(tmpdir(), "db-parity-"));
  const outPath = path.join(dir, "out.json");
  const script = `
import json, psycopg
uri = ${JSON.stringify(uri)}
out_path = ${JSON.stringify(outPath)}
${body}
`;
  const r = spawnSync(py, ["-c", script], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`psycopg subprocess failed:\n${r.stderr}\n${r.stdout}`);
  return JSON.parse(readFileSync(outPath, "utf-8")) as T;
}

/** True only when the live-DB tests are explicitly opted in (RUN_DB_PARITY=1). */
export const dbParityOptIn = (): boolean => process.env.RUN_DB_PARITY === "1";

/**
 * Opt-in + fail-loud describe wrapper. See file header for the three branches.
 * Importantly: when NOT opted in, the body is NEVER invoked (no live fetch at
 * collection time), and dbUri/pythonBin are not even probed.
 */
export function gateDescribe(name: string, body: () => void): void {
  if (!dbParityOptIn()) {
    describe.skip(name, () => {});
    return;
  }
  if (dbUri() && pythonBin()) {
    describe(name, body);
    return;
  }
  describe(name, () => {
    it("DB parity opted in (RUN_DB_PARITY=1) but DB creds / python+psycopg are missing", () => {
      throw new Error(
        "RUN_DB_PARITY=1 but no usable DB URI (DESTINATION__POSTGRES__CREDENTIALS or .dlt/secrets.toml) " +
          "and/or python with psycopg. Refusing to pass silently — green must mean the parity assertions ran.",
      );
    });
  });
}
