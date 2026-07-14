/**
 * Minimal vCard (.vcf) → contact-row parser. Covers the common Apple Contacts /
 * Google Contacts exports (vCard 3.0/4.0) without a third-party dependency:
 * unfolds line continuations, splits on BEGIN/END:VCARD, and reads FN/N, EMAIL
 * (preferring a WORK/PREF address), and TEL. Cards without a valid email are
 * reported in `skipped`, not silently dropped.
 */
import type { ContactRow } from "./types";

export interface VcardParseResult {
  rows: ContactRow[];
  skipped: number;
  skip_reasons: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Unfold RFC-6350 folded lines: a CRLF/LF followed by a space or tab continues
 *  the previous line. */
function unfold(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const out: string[] = [];
  for (const line of normalized.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Parse a `PROP;PARAM=...:value` content line into name, params, value. */
function parseLine(line: string): { name: string; params: string[]; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1).trim();
  const segs = head.split(";");
  const name = (segs[0] ?? "").toUpperCase();
  const params = segs.slice(1).map((s) => s.toUpperCase());
  return { name, params, value };
}

/** "Family;Given;Middle;Prefix;Suffix" → "Given Family". */
function nameFromN(value: string): string {
  const [family = "", given = ""] = value.split(";");
  return [given.trim(), family.trim()].filter(Boolean).join(" ");
}

export function parseVcards(text: string): VcardParseResult {
  const rows: ContactRow[] = [];
  const skip_reasons: string[] = [];
  let skipped = 0;

  const lines = unfold(text);
  let inCard = false;
  let fn = "";
  let nName = "";
  let emails: { value: string; preferred: boolean }[] = [];
  let phone: string | null = null;

  const flush = () => {
    const name = (fn || nName).trim() || null;
    const chosen = emails.find((e) => e.preferred)?.value ?? emails[0]?.value ?? "";
    const email = chosen.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      skipped++;
      skip_reasons.push(`vCard ${name ?? "unknown"}: no valid email`);
    } else {
      rows.push({ email, name, phone, tags: [], attribs: {} });
    }
    fn = "";
    nName = "";
    emails = [];
    phone = null;
  };

  for (const raw of lines) {
    const upper = raw.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      inCard = true;
      fn = "";
      nName = "";
      emails = [];
      phone = null;
      continue;
    }
    if (upper === "END:VCARD") {
      if (inCard) flush();
      inCard = false;
      continue;
    }
    if (!inCard) continue;

    const parsed = parseLine(raw);
    if (!parsed) continue;
    if (parsed.name === "FN") fn = parsed.value;
    else if (parsed.name === "N") nName = nameFromN(parsed.value);
    else if (parsed.name === "EMAIL") {
      const preferred = parsed.params.some((p) => p.includes("WORK") || p.includes("PREF"));
      if (parsed.value) emails.push({ value: parsed.value, preferred });
    } else if (parsed.name === "TEL") {
      if (!phone && parsed.value) phone = parsed.value;
    }
  }

  return { rows, skipped, skip_reasons };
}
