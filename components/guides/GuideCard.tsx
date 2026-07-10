import Image from "next/image";
import Link from "next/link";
import type { GuideDef } from "@/lib/guides/types";

/** Hub card — image + title + card copy, Figma-band style. Flat bordered card. */
export function GuideCard({ guide }: { guide: GuideDef }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gulf-haze bg-gulf-deep transition-colors hover:border-gulf-teal"
    >
      <div className="aspect-[4/3] overflow-hidden border-b border-gulf-haze bg-white">
        <Image
          src={guide.cardImage}
          alt=""
          width={640}
          height={480}
          className="h-full w-full object-cover object-top"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold text-text-primary group-hover:text-gulf-teal">
          {guide.title}
        </h3>
        <p className="mt-2 flex-1 text-sm text-text-secondary">{guide.description}</p>
        <span className="mt-4 text-sm font-medium text-gulf-teal">
          {guide.kind === "tips" ? "See the tips →" : "Read the guide →"}
        </span>
      </div>
    </Link>
  );
}
