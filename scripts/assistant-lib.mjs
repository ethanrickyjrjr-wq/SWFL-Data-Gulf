import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";

export const ROOT = process.cwd();

function parseDateFromFilename(filename) {
  const m = basename(filename).match(/^(\d{4}-\d{2}-\d{2})-/);
  return m ? new Date(m[1] + "T00:00:00") : null;
}

/** Age of file in days based on filename date prefix. Returns Infinity if no date. */
export function specAgeInDays(filepath) {
  const d = parseDateFromFilename(filepath);
  if (!d) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Days since last git commit touching this file. Returns Infinity if never committed. */
export function gitDaysAgo(filepath) {
  try {
    const out = execSync(`git log --format="%ad" --date=short -1 -- "${filepath}"`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (!out) return Infinity;
    return Math.floor((Date.now() - new Date(out + "T00:00:00").getTime()) / 86_400_000);
  } catch {
    return Infinity;
  }
}

/** Extract slug from spec filename: date-slug[-design].md → slug */
export function specSlug(filename) {
  return basename(filename)
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-design\.md$/, "")
    .replace(/\.md$/, "");
}

/**
 * Check if slug keywords appear in any build-queue line.
 * Returns 'done' | 'building' | 'next' | 'mentioned' | null
 */
export function queueStatus(slug, queueText) {
  const keywords = slug.split("-").filter((w) => w.length > 4);
  if (!keywords.length) return null;
  for (const line of queueText.split("\n")) {
    const lower = line.toLowerCase();
    const hit = keywords.some((k) => lower.includes(k.toLowerCase()));
    if (!hit) continue;
    if (/^\s*-\s*\[x\]/.test(line)) return "done";
    if (/^\s*-\s*\[~\]/.test(line)) return "building";
    if (/^\s*-\s*\[ \]/.test(line)) return "next";
    return "mentioned";
  }
  return null;
}

/** Returns true if any open check key contains slug keywords. */
export function isReferencedByCheck(slug, openCheckKeys) {
  const keywords = slug
    .replace(/-/g, "_")
    .split("_")
    .filter((w) => w.length > 4);
  if (!keywords.length) return false;
  return openCheckKeys.some((k) =>
    keywords.some((kw) => k.toLowerCase().includes(kw.toLowerCase())),
  );
}

/** Decide if a spec should be archived. */
export function isDeadSpec(filepath, queueText, openCheckKeys) {
  const age = specAgeInDays(filepath);
  const slug = specSlug(filepath);
  const gitAge = gitDaysAgo(filepath);
  const status = queueStatus(slug, queueText);
  const checkedOut = isReferencedByCheck(slug, openCheckKeys);

  if (checkedOut) return { dead: false, reason: "referenced by open check" };
  if (status === "building" || status === "next")
    return { dead: false, reason: `queue status: ${status}` };
  if (gitAge < 14) return { dead: false, reason: `recently touched in git (${gitAge}d ago)` };

  if (status === "done" && age >= 14) {
    return {
      dead: true,
      reason: `build-queue [x], ${age} days old, last touched ${gitAge === Infinity ? "never" : gitAge + "d"} ago`,
    };
  }
  if (status === null && age >= 60) {
    return {
      dead: true,
      reason: `not in build-queue, ${age} days old, last touched ${gitAge === Infinity ? "never" : gitAge + "d"} ago`,
    };
  }
  return { dead: false, reason: `age ${age}d, status: ${status ?? "unqueued"}` };
}

/** Decide if a handoff doc should be archived. */
export function isDeadHandoff(filepath, openCheckKeys) {
  const name = basename(filepath).toLowerCase();
  const slug = name.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const age = specAgeInDays(filepath);
  const gitAge = gitDaysAgo(filepath);

  if (isReferencedByCheck(slug, openCheckKeys))
    return { dead: false, reason: "referenced by open check" };
  if (gitAge < 14) return { dead: false, reason: `recently touched in git (${gitAge}d ago)` };

  if (/shipped|done|cleanup/.test(name)) {
    return { dead: true, reason: `filename signals completion, ${age} days old` };
  }
  if (age >= 21) {
    return { dead: true, reason: `${age} days old, no open check` };
  }
  return { dead: false, reason: `age ${age}d` };
}

/** Move a file to archiveDir, preserving filename. Creates archiveDir if needed. */
export function archiveFile(src, archiveDir) {
  mkdirSync(archiveDir, { recursive: true });
  const dest = resolve(archiveDir, basename(src));
  renameSync(src, dest);
  return dest;
}

/** Append archive entries to CLEANED.md. */
export function appendCleaned(cleanedPath, entries) {
  if (!entries.length) return;
  const today = new Date().toISOString().slice(0, 10);
  const lines =
    entries
      .map(
        ({ src, dest, reason }) =>
          `${today}  ARCHIVED  ${src}\n            Reason: ${reason}\n            → ${dest}`,
      )
      .join("\n") + "\n\n";
  const existing = existsSync(cleanedPath)
    ? readFileSync(cleanedPath, "utf8")
    : "# CLEANED — archive log\n\n";
  writeFileSync(cleanedPath, existing + lines);
}

/** Write _ASSISTANT/TODAY.md. */
export function writeTodayMd({
  todayPath,
  date,
  building,
  overdueChecks,
  lastShip,
  specCount,
  candidateCount,
}) {
  const lines = [
    `# ${date} Brief`,
    "",
    "## In Flight",
    ...(building.length
      ? building.map((b) => `- ${b}`)
      : ["- nothing marked [~] in build-queue.md"]),
    "",
    "## Overdue Checks",
    ...(overdueChecks.length ? overdueChecks.map((c) => `- ${c}`) : ["- none overdue"]),
    "",
    "## Last Session",
    `- ${lastShip}`,
    "",
    "## Spec Health",
    `- ${specCount} specs total · ${candidateCount} candidates for archive`,
    `- run \`node scripts/assistant-weekly.mjs\` to clean`,
    "",
  ];
  mkdirSync(dirname(todayPath), { recursive: true });
  writeFileSync(todayPath, lines.join("\n"));
}
