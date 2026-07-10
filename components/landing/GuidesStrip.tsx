import Image from "next/image";
import Link from "next/link";
import { GUIDES } from "@/lib/guides/registry";

/**
 * Homepage cross-link strip into /guides (spec §6 — the only homepage change
 * in the guides-hub build). Cards reuse the registry's card art + copy, so the
 * strip can never drift from the hub.
 */
export default function GuidesStrip() {
  return (
    <section className="guides-strip" aria-labelledby="guides-strip-headline">
      <div className="cap-eyebrow">Why agents trust what we build</div>
      <h2 id="guides-strip-headline" className="cap-headline">
        We&rsquo;re not asking you to trust the AI. <span>We&rsquo;re showing you the system.</span>
      </h2>
      <div className="guides-strip-cards">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`} className="guides-strip-card">
            <span className="guides-strip-art">
              <Image src={g.cardImage} alt="" width={640} height={480} />
            </span>
            <span className="guides-strip-title">{g.title}</span>
            <span className="guides-strip-desc">{g.description}</span>
            <span className="guides-strip-more">Read it →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
