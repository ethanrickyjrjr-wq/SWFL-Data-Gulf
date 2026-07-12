// lib/concoctions/chart-block.ts — STUB (Task 5). Task 6 replaces this with the
// real bar/trend SVG → PNG → email-media path. The materializer catches the
// throw and degrades the slice to its list fallback, so Task 5 ships green.
import type { EmailBlock } from "@/lib/email/doc/types";
import type { ConcoctionDef, ConcoctionRow, DefaultBlockSpec } from "./types";

export interface ChartBlockOpts {
  asOf: string;
  hostPng?: (key: string, buf: Buffer) => Promise<string>;
  accent?: string;
  ids?: () => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = ConcoctionDef<any>;

export async function buildChartBlock(
  _def: AnyDef,
  _rows: ConcoctionRow[],
  _spec: DefaultBlockSpec,
  _opts: ChartBlockOpts,
): Promise<EmailBlock> {
  throw new Error("chart-block: not implemented (Task 6)");
}
