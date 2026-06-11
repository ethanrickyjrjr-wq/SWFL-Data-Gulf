import { Suspense } from "react";
import { AskPage } from "./AskPage";

export const metadata = {
  title: "Ask SWFL Data Gulf",
  description: "Ask anything about Southwest Florida real estate, economy, and market data.",
};

async function AskPageLoader({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; r?: string }>;
}) {
  const { q, r } = await searchParams;
  return <AskPage initialQ={q ?? ""} reportId={r ?? "master"} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; r?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-navy-dark" />}>
      <AskPageLoader searchParams={searchParams} />
    </Suspense>
  );
}
