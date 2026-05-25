import { writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Atomically write `data` as deterministic JSON to `filePath`. Writes to a
 * sibling `.tmp` file first, then renames — POSIX rename is atomic on the
 * same filesystem, so readers never observe a half-written file.
 *
 * "Deterministic" means: 2-space indent, sorted object keys, trailing newline.
 * Running twice in a row with the same input produces a byte-identical file —
 * a property the Stage 4 sidecar pipeline (and `npm run fixtures:corridors`)
 * rely on to keep git noise to zero when nothing changed.
 */
export async function writeJsonAtomic(
  filePath: string,
  data: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const json = stringifyDeterministic(data) + "\n";
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, json, "utf-8");
  await rename(tmpPath, filePath);
}

function stringifyDeterministic(value: unknown): string {
  return JSON.stringify(value, sortKeysReplacer, 2);
}

function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[k] = (value as Record<string, unknown>)[k];
  }
  return sorted;
}
