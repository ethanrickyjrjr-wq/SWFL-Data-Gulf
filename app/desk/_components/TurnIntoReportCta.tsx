import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { anonymousLabArrival } from "@/lib/lab-entry/destination";

/**
 * The shared "turn this into a report" CTA slot (SPEC-B SEAM: B reuses this
 * exact slot for its email-capture / deep-link variants). Routes through the
 * lab-entry root — the free build is the PLG wedge; sending is the paywall,
 * so this link gates nothing.
 */
export function TurnIntoReportCta({ recipe }: { recipe: string }) {
  return (
    <Link
      href={anonymousLabArrival({ recipe, ref: "desk" })}
      className="inline-flex items-center gap-1 rounded-md border border-[#22414f] bg-[#0a1419]/80 px-2 py-1 font-mono text-[10px] text-[#807e76] transition-all duration-200 hover:border-gulf-teal/50 hover:text-gulf-teal"
    >
      <ArrowUpRight className="h-3 w-3" />
      Turn this into a branded report
    </Link>
  );
}
