// app/go/page.tsx — the one-click launch page (operator decree 08/10/2026).
// Chrome-free (nav/footer/AI pill all suppressed via CHROME_FREE_PREFIXES +
// AI_CHROME_FREE_PREFIXES): a Google-simple hero + bar, nothing else. Built to
// move to its own domain later — it shares only the lab door and the address
// APIs with the main site, no layout coupling.
import type { Metadata } from "next";
import { Montserrat, Lato } from "next/font/google";
import OneClickHero from "@/components/go/OneClickHero";

// The operator's brand row (user_brand_profiles): Montserrat display, Lato body.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--go-font-display",
});
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  // absolute: escape the root layout's "%s — SWFL Data Gulf" template — no
  // SWFL Data Gulf anywhere on this page (operator, 08/10/2026).
  title: { absolute: "Address to Email in One Click" },
  description:
    "Type your listing's address, pick the email, and it's built — every number names its source.",
};

export default function GoPage() {
  return (
    <div className={`${lato.className} ${montserrat.variable}`}>
      <OneClickHero />
    </div>
  );
}
