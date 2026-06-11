// scripts/email/log-io.mts
import fs from "node:fs";
import path from "node:path";
import type { EmailLog } from "./types.ts";

const REPO_ROOT = path.join(import.meta.dirname, "..", "..");
export const DEFAULT_LOG_DIR = path.join(REPO_ROOT, "docs", "email-marketing", "email-logs");

/** Most recent log by filename descending — NOT calendar-yesterday (EMAIL.md Rule 1). */
export function readMostRecentLog(logDir = DEFAULT_LOG_DIR): EmailLog | null {
  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  for (const f of files) {
    try {
      return JSON.parse(fs.readFileSync(path.join(logDir, f), "utf-8")) as EmailLog;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * True if today's log exists with send_status "sent" → abort, don't re-send.
 * send_status "error" → false, retry is allowed.
 */
export function isTodayAlreadySent(today: string, logDir = DEFAULT_LOG_DIR): boolean {
  const p = path.join(logDir, `${today}.json`);
  if (!fs.existsSync(p)) return false;
  try {
    return (JSON.parse(fs.readFileSync(p, "utf-8")) as EmailLog).send_status === "sent";
  } catch {
    return false;
  }
}

/** Write log. Overwrites existing file for the same date. */
export function writeLog(log: EmailLog, logDir = DEFAULT_LOG_DIR): void {
  fs.writeFileSync(path.join(logDir, `${log.date}.json`), JSON.stringify(log, null, 2));
}

export function getNextIssueNumber(logDir = DEFAULT_LOG_DIR): number {
  return (readMostRecentLog(logDir)?.issue ?? 0) + 1;
}
