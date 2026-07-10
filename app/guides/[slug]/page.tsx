import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { GUIDES, guideBySlug } from "@/lib/guides/registry";

const ORIGIN = "https://www.swfldatagulf.com";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const guide = guideBySlug(slug);
  if (!guide) return {};
  return {
    title: `${guide.title} — SWFL Data Gulf`,
    description: guide.description,
    openGraph: {
      title: guide.title,
      description: guide.description,
      images: [`${ORIGIN}${guide.cardImage}`],
    },
  };
}

export default async function GuidePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  return (
    <PageShell width="wide">
      <GuideArticle guide={guide} />
    </PageShell>
  );
}
