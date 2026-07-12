import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
import { InsidersCapture } from "@/app/insiders/_components/insiders-capture";
import "@/app/insiders/insiders.css";

/**
 * The Insiders band (spec 2026-07-12-homepage-one-site-design.md) — THE homepage email
 * capture (operator pick 07/12/2026; the weekly-read capture stays on ZIP report pages
 * where it's contextual). Wrapped in the `insiders-page` scope so the flagship's own
 * editorial grammar — serif nameplate face, kicker, capture form — renders here from
 * ONE stylesheet, not a copy. Same next/font pattern as app/insiders/page.tsx: the
 * face loads only on routes that mount this component.
 */
const instrument = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
});

export default function InsidersBand() {
  return (
    <section
      className={`insiders-page ins-band ${instrument.variable}`}
      aria-labelledby="ins-band-h"
    >
      <p className="ins-kicker">The Insiders Edition</p>
      <h2 id="ins-band-h" className="ins-band-h">
        The monthly read, machine-checked.
      </h2>
      <p className="ins-band-sub">
        Written by <strong>Claude Fable 5</strong> and fact-checked by code that will not let it
        invent a number. One email a month — every figure names its source.
      </p>
      <InsidersCapture source="homepage-band" />
      <p className="ins-band-link">
        <Link href="/insiders">See how an issue is made →</Link>
      </p>
    </section>
  );
}
