"use client";

import { useState } from "react";
import Link from "next/link";

interface CorridorItem {
  slug: string;
  name: string;
}

interface CityGroup {
  city: string;
  corridors: CorridorItem[];
}

export interface CountyGroup {
  county: string;
  cities: CityGroup[];
}

export interface CRECorridorClientProps {
  groups: CountyGroup[];
}

export function CRECorridorClient({ groups }: CRECorridorClientProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mt-4 space-y-8">
      {groups.map(({ county, cities }) => (
        <div key={county}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {county === "Unknown" ? "Other SWFL" : `${county} County`}
          </h3>
          <div className="space-y-2">
            {cities.map(({ city, corridors }) => {
              const key = `${county}::${city}`;
              const isOpen = expanded.has(key);
              return (
                <div key={key}>
                  {/* City row — click to expand/collapse corridors */}
                  <button
                    onClick={() => toggle(key)}
                    className={[
                      "flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition-colors",
                      isOpen
                        ? "border-[#00d4aa] bg-[#00d4aa]/[0.08] text-[#00d4aa]"
                        : "border-[#00d4aa]/30 bg-[#00d4aa]/[0.04] text-gray-300 hover:border-[#00d4aa]/60 hover:text-[#00d4aa]",
                    ].join(" ")}
                  >
                    <span>{city}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${isOpen ? "text-[#00d4aa]/70" : "text-gray-600"}`}>
                        {corridors.length} corridor{corridors.length !== 1 ? "s" : ""}
                      </span>
                      <svg
                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 6l4 4 4-4" />
                      </svg>
                    </div>
                  </button>

                  {/* Corridor pills — shown when city is expanded */}
                  {isOpen && (
                    <ul className="ml-4 mt-2 flex flex-wrap gap-2">
                      {corridors.map(({ slug, name }) => (
                        <li key={slug}>
                          <Link
                            href={`/r/cre-swfl/${slug}`}
                            className="inline-flex items-center rounded-full border border-[#00d4aa]/40 bg-[#00d4aa]/[0.04] px-3 py-1 text-sm text-gray-300 transition-colors hover:border-[#00d4aa] hover:bg-[#00d4aa]/[0.08] hover:text-[#00d4aa]"
                          >
                            {name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
