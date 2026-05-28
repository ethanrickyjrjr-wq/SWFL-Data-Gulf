import Image from "next/image";
import { buildLedger } from "../lib/ledger";
import { CategorySection, Link } from "./ui";

export const revalidate = 300;

export default async function Home() {
  const ledger = await buildLedger();

  return (
    <main className="wrap">
      <div className="topbar">
        <Image
          src="/logo.png"
          alt="SWFL Data Gulf"
          width={48}
          height={48}
          className="logo"
          priority
        />
        <div>
          <h1>SWFL Data Gulf — /ops</h1>
          <p className="subtitle mono">
            Live operations ledger · status derived from real signals ·{" "}
            {ledger.generatedAt.slice(0, 16).replace("T", " ")} UTC
          </p>
        </div>
      </div>

      {(!ledger.signals.github || !ledger.signals.supabase) && (
        <div className="banner warn">
          Signal degraded: {!ledger.signals.github && "GitHub PAT unset "}
          {!ledger.signals.supabase && "Supabase env unset"} — affected rows
          show unknown until configured.
        </div>
      )}

      <nav className="catnav">
        {ledger.categories.map((c) => (
          <a key={c.key} href={`#${c.key}`}>
            {c.title}
          </a>
        ))}
        <Link href="/queue">Build queue →</Link>
      </nav>

      {ledger.categories.map((c) => (
        <div id={c.key} key={c.key}>
          <CategorySection cat={c} />
        </div>
      ))}

      <footer>
        SWFL Data Gulf · /ops · everything shown, status derived live (GitHub
        Actions, repo files, Supabase). The goal lives in{" "}
        <code>docs/THE-GOAL.md</code>; what&apos;s next lives in{" "}
        <Link href="/queue">the build queue</Link>.
      </footer>
    </main>
  );
}
