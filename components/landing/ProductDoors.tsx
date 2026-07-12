import Image from "next/image";
import Link from "next/link";
import { EMAIL_LAB_LANDING, seedGalleryDestination } from "@/lib/lab-entry/destination";
import { SEED_PREVIEWS, SEED_PREVIEW_CAPTION } from "@/lib/email/doc/seed-previews";
import type { HomeStatCell } from "@/lib/landing/load-home-map-data";

/**
 * The two doors (spec 2026-07-12-homepage-one-site-design.md) — replaces the persona
 * cards + the hand-faked email mock. NN/g homepage principle 3.2: reveal content
 * through REAL examples. The data door shows the desk's own live figures (the stats
 * the old map stats-bar rendered — moved here, not duplicated); the deliverables door
 * shows real committed template captures from the seed-preview manifest. Both doors
 * route into the pages they preview. Empty-tolerant: no live stats → the tiles hide,
 * the door itself stays.
 */

// Three jobs an agent recognizes on sight: a listing send, a weekly pulse, a monthly
// letter. Ids must exist in SEED_DOCS — seed-previews.test.ts guards the captures.
const DOOR_SEED_IDS = ["new-listing", "weekly-pulse", "market-letter"];

export default function ProductDoors({ stats }: { stats: HomeStatCell[] }) {
  const previews = DOOR_SEED_IDS.map((id) => SEED_PREVIEWS.find((p) => p.id === id)).filter(
    (p): p is NonNullable<typeof p> => p != null,
  );

  return (
    <section className="doors" aria-label="Live data and branded deliverables">
      <div className="cap-eyebrow">One engine, two rooms</div>
      <h2 className="cap-headline">
        Live data in. <span>Branded campaigns out.</span>
      </h2>

      <div className="doors-grid">
        {/* ── Door 1: the data ─────────────────────────────────────────── */}
        <div className="door">
          <div className="door-head">
            <span className="door-kicker">SWFL Data Desk</span>
            <span className="door-live">
              <span className="ins-pulse" aria-hidden="true" />
              Live
            </span>
          </div>
          <p className="door-desc">
            A daily market terminal for Lee &amp; Collier — asking prices, inventory, price cuts,
            what moved on the wire today. Every figure carries its own source and date.
          </p>
          {stats.length > 0 && (
            <div className="door-tiles">
              {stats.slice(0, 3).map((s) => (
                <div className="door-tile" key={s.label}>
                  <div className="stat-label">{s.label}</div>
                  <div className="door-tile-value">{s.value}</div>
                  <div className="stat-sub">{s.sub}</div>
                  <div className="door-tile-tag">{s.tag}</div>
                </div>
              ))}
            </div>
          )}
          <div className="door-links">
            <Link className="cap-btn" href="/desk">
              Open the Data Desk
            </Link>
            <Link className="door-more" href="/charts">
              or explore every chart →
            </Link>
          </div>
        </div>

        {/* ── Door 2: the deliverables ─────────────────────────────────── */}
        <div className="door">
          <div className="door-head">
            <span className="door-kicker">The Deliverables</span>
          </div>
          <p className="door-desc">
            Describe it once. The engine builds it from the data on the left, wears your brand, and
            sends it on your schedule — you review the first one, it handles the rest.
          </p>
          <div className="door-previews">
            {previews.map((p) => (
              <Link
                className="door-preview"
                key={p.id}
                href={seedGalleryDestination(p.id)}
                aria-label={`Start from the ${p.name} layout`}
              >
                <span className="door-preview-art">
                  <Image
                    src={p.image}
                    alt=""
                    fill
                    sizes="(max-width: 860px) 44vw, 200px"
                    className="door-preview-img"
                  />
                </span>
                <span className="door-preview-name">{p.name}</span>
              </Link>
            ))}
          </div>
          <p className="door-caption">
            {SEED_PREVIEW_CAPTION} · start from any of {SEED_PREVIEWS.length} layouts
          </p>
          <div className="door-links">
            <a className="cap-btn" href={EMAIL_LAB_LANDING}>
              Build one free
            </a>
            <Link className="door-more" href="/showcase">
              see every layout →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
