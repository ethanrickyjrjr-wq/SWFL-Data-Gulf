import type { Metadata } from "next";
import {
  resolveMethod,
  type MethodologyEntry,
} from "../../../../refinery/lib/methodology-registry.mts";
import { isPublishedSourceTable } from "../../source/_tables";
import { ReportShell, ReportHeader, ReportFooter, Meta } from "../../_components/report-shell";
import { ReportAi } from "../../_components/report-ai";
import { Breadcrumbs } from "@/components/nav/Breadcrumbs";
import { methodTrail } from "@/lib/nav/breadcrumbs";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function generateStaticParams(): Promise<{ metric: string }[]> {
  return [];
}

const VALID_SLUG = /^[a-z0-9_]+$/;

interface PageProps {
  params: Promise<{ metric: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { metric } = await params;
  const entry = VALID_SLUG.test(metric) ? resolveMethod(metric) : null;
  if (!entry) return { title: "Methodology — SWFL Data Gulf" };
  return {
    title: `${entry.label} — how it is computed — SWFL Data Gulf`,
    description: entry.measures,
  };
}

export default async function MethodPage({ params }: PageProps) {
  const { metric } = await params;
  const entry = VALID_SLUG.test(metric) ? resolveMethod(metric) : null;
  if (!entry) return <NotDocumentedPanel metric={metric} />;
  return <Method metric={metric} entry={entry} />;
}

function Method({ metric, entry }: { metric: string; entry: MethodologyEntry }) {
  const showSourceLink = entry.sourceTable ? isPublishedSourceTable(entry.sourceTable) : false;

  const content = (
    <>
      <Breadcrumbs trail={methodTrail(entry.label)} />
      <ReportHeader title={entry.label}>
        <p className="mt-3 font-mono text-sm text-gray-400">{metric}</p>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-300">{entry.measures}</p>
      </ReportHeader>

      <section className="mt-8">
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">How it is computed</dt>
            <dd className="mt-1 text-sm leading-7 text-gray-200">{entry.formula}</dd>
          </div>
          {entry.denominator && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-gray-500">
                Coverage / denominator
              </dt>
              <dd className="mt-1 text-sm leading-7 text-gray-200">{entry.denominator}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-8">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Meta
            label="Source data"
            value={
              showSourceLink ? (
                <a
                  href={`/r/source/${entry.sourceTable}`}
                  className="text-gulf-teal underline underline-offset-2 hover:text-gulf-teal/80"
                >
                  view the rows ↗
                </a>
              ) : (
                "—"
              )
            }
          />
          <Meta
            label="Brain"
            value={
              entry.brain ? (
                <a
                  href={`/r/${entry.brain}`}
                  className="text-gulf-teal underline underline-offset-2 hover:text-gulf-teal/80"
                >
                  {entry.brain}
                </a>
              ) : (
                "—"
              )
            }
          />
          {entry.doc && (
            <Meta
              label="Reference"
              value={
                <a
                  href={entry.doc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gulf-teal underline underline-offset-2 hover:text-gulf-teal/80"
                >
                  methodology doc ↗
                </a>
              }
            />
          )}
        </dl>
      </section>

      <ReportFooter note="Methodology page — what this metric measures and how it is derived. Values are audited against the linked source rows; this page explains the formula, not a track record." />

      <ReportAi surface="method" surfaceKey={metric} />
    </>
  );

  return <ReportShell>{content}</ReportShell>;
}

function NotDocumentedPanel({ metric }: { metric: string }) {
  return (
    <ReportShell>
      <ReportHeader title="Not a documented metric">
        <p className="mt-3 font-mono text-sm text-gray-400">{metric}</p>
      </ReportHeader>
      <section className="mt-8">
        <p className="text-base leading-7 text-gray-300">
          This metric does not have a published methodology page yet. If you arrived from a report
          link, the metric may have been renamed or is not documented.
        </p>
      </section>
    </ReportShell>
  );
}
