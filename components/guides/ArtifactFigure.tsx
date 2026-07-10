import Image from "next/image";
import type { ArtifactFigure as ArtifactFigureDef } from "@/lib/guides/types";

/** Real product output as an article figure — caption + provenance + as-of, never decoration. */
export function ArtifactFigure({ figure }: { figure: ArtifactFigureDef }) {
  return (
    <figure className="my-8 overflow-hidden rounded-xl border border-gulf-haze bg-gulf-deep">
      <Image
        src={figure.src}
        alt={figure.alt}
        width={1200}
        height={800}
        unoptimized={figure.src.endsWith(".svg")}
        className="w-full bg-white"
        style={{ height: "auto" }}
        sizes="(min-width: 1024px) 720px, 100vw"
      />
      <figcaption className="border-t border-gulf-haze px-4 py-3 text-sm text-text-secondary">
        {figure.caption}{" "}
        <span className="text-text-tertiary">
          Source: {figure.provenance}. As of {figure.asOf}.
        </span>
      </figcaption>
    </figure>
  );
}
