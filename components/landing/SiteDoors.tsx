import Link from "next/link";

/**
 * Two quiet doors (spec 2026-07-12 one-bar) — one-line text links, deliberately NOT
 * previews: the inner pages keep their own devices (operator correction 07/11/2026,
 * memory feedback_homepage-grammar-not-collage). Just enough scent to route.
 * Guides left the doors row for its own full card section (GuidesStrip).
 */
const DOORS = [
  {
    href: "/desk",
    kicker: "The Data Desk",
    line: "The live market terminal — refreshed daily, every figure sourced and dated.",
  },
  {
    href: "/insiders",
    kicker: "The Insiders Edition",
    line: "The monthly read, written by AI and fact-checked by machine. Free.",
  },
];

export default function SiteDoors() {
  return (
    <nav className="site-doors" aria-label="Explore the rest of the site">
      {DOORS.map((door) => (
        <Link key={door.href} href={door.href} className="site-door">
          <span className="site-door-kicker">{door.kicker}</span>
          <span className="site-door-line">{door.line}</span>
          <span className="site-door-go" aria-hidden="true">
            →
          </span>
        </Link>
      ))}
    </nav>
  );
}
