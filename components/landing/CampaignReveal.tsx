"use client";

import { useEffect, useRef, useState } from "react";
import { EMAIL_LAB_LANDING, openZipLab } from "@/lib/lab-entry/destination";
import type { CampaignDemo } from "@/lib/landing/campaign-demo";

/**
 * The homepage's OWN centerpiece (spec 2026-07-12-homepage-one-site-design.md §v2,
 * operator-approved 07/11/2026): the transformation no inner page shows — a place
 * goes in, a finished campaign comes out, performed once on screen.
 *
 * Correctness rules baked in:
 *  - Every figure is a REAL loader value with its own source · date stamp (props
 *    from lib/landing/campaign-demo — null demo → this never mounts).
 *  - No minted street address: the bar "types" a real place from live data.
 *  - The AI-commentary line is a LABELED SLOT (skeleton bars + tag), never invented
 *    market prose.
 *  - One pass of motion, started when the stage scrolls into view; base state is the
 *    FINISHED composition, so no-JS and prefers-reduced-motion both read it static
 *    (NN/g: everything must read with animations off).
 *  - The stage LOOKS like the product, so it must BEHAVE like a door (operator,
 *    07/11/2026: "i couldn't click any buttons or write") — the whole card is one
 *    anchor into the real builder carrying this exact campaign's ZIP; the pieces
 *    inside stay spans (never a dead input on the front door). Typing lives in the
 *    hero bar above and in the builder it opens.
 */
export default function CampaignReveal({ demo }: { demo: CampaignDemo }) {
  const ref = useRef<HTMLElement>(null);
  const [play, setPlay] = useState(false);

  // Start the single pass when a third of the stage is visible. State flips inside
  // the observer callback (not the effect body — the set-state-in-effect ban).
  useEffect(() => {
    const el = ref.current;
    if (!el || play) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPlay(true);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [play]);

  const d = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

  return (
    <section
      ref={ref}
      className={`cr${play ? " cr-play" : ""}`}
      aria-label="Watch a campaign build"
    >
      <p className="cap-eyebrow">Watch it happen</p>
      <h2 className="cap-headline">
        A place goes in. <span>A campaign comes out.</span>
      </h2>

      <a
        className="cr-stage"
        href={openZipLab(demo.zip, { ref: "home-reveal" })}
        aria-label={`Open this ${demo.place} market update in the builder — free, yours to edit`}
      >
        {/* ── The ask: a real place, typed ─────────────────────────────── */}
        <div className="cr-bar cr-anim" style={d(0.1)}>
          <span className="cr-chip">Market Update</span>
          <span className="cr-typewrap">
            <span className="cr-type" style={{ "--ch": demo.typed.length } as React.CSSProperties}>
              {demo.typed}
            </span>
          </span>
          <span className="cr-build">Build it</span>
        </div>

        <div className="cr-flow">
          {/* ── The artifact: a light email doc, assembling ─────────────── */}
          <div className="cr-doc cr-anim" style={d(1.2)}>
            <div className="cr-doc-top">
              <span className="cr-doc-dot" />
              <span className="cr-doc-dot" />
              <span className="cr-doc-dot" />
            </div>
            <p className="cr-subject cr-anim" style={d(1.6)}>
              {demo.subject}
            </p>
            {demo.figures.map((f, i) => (
              <div className="cr-fig cr-anim" key={f.label} style={d(2.0 + i * 0.4)}>
                <span className="cr-fig-label">{f.label}</span>
                <span className="cr-fig-value">{f.value}</span>
                <span className="cr-fig-source">{f.source}</span>
              </div>
            ))}
            {/* The commentary SLOT — labeled, never faked prose. */}
            <div className="cr-read cr-anim" style={d(2.0 + demo.figures.length * 0.4)}>
              <span className="cr-read-bar" style={{ width: "92%" }} />
              <span className="cr-read-bar" style={{ width: "71%" }} />
              <span className="cr-read-tag">
                AI market read — written from the figures above, cited
              </span>
            </div>
          </div>

          {/* ── The rest of the campaign ────────────────────────────────── */}
          <div className="cr-rail">
            <div className="cr-social cr-anim" style={d(2.6 + demo.figures.length * 0.4)}>
              <span className="cr-social-place">{demo.place}</span>
              <span className="cr-social-value">{demo.figures[0].value}</span>
              <span className="cr-social-label">{demo.figures[0].label.toLowerCase()}</span>
              <span className="cr-social-brand">Your brand here</span>
            </div>
            <span className="cr-pill cr-anim" style={d(3.0 + demo.figures.length * 0.4)}>
              Scheduled · weekly
            </span>
            <span className="cr-pill cr-pill-go cr-anim" style={d(3.4 + demo.figures.length * 0.4)}>
              ✓ Ready to send
            </span>
          </div>
        </div>

        <span className="cr-open-hint cr-anim" style={d(3.8 + demo.figures.length * 0.4)}>
          Click the campaign — it opens in the builder, yours to edit →
        </span>
      </a>

      <p className="cr-caption">
        Real figures, live right now — each one carrying its source. You review the first send; the
        engine keeps every send after it fresh.
      </p>
      <div className="cap-cta-row">
        <a className="cap-btn" href={EMAIL_LAB_LANDING}>
          Build yours free
        </a>
      </div>
    </section>
  );
}
