"use client";
// components/should-i-sell/SellNowVsWait.tsx
//
// Section 3 — the personalized sell-now-vs-wait dollar spread (address-gated). The one
// place a wrong default becomes a financial claim on someone's largest asset, so every
// input is sourced, cited, or REQUIRED from the user:
//   • V0            — an estimate from nearby sales (never "your home is worth $X"),
//                     overridable with the user's own number.
//   • projection    — [INFERENCE]-tagged, cites the YoY base, states a falsifier.
//   • property tax  — a cited county figure OR the user's real bill; never guessed.
//   • insurance     — REQUIRED user-entered, no default ever; until entered the spread
//                     is shown "before insurance" with an explicit prompt.
//   • mortgage      — optional; $0 when blank, stated plainly.
// The spread is always rendered as line items — never a bare final number.
import { useMemo, useState, type ReactNode } from "react";
import { computeSpread, type Horizon, type SpreadInputs } from "@/lib/should-i-sell/spread-calc";
import { monthYearLabel } from "@/lib/should-i-sell/format-period";

// Local heading (matches the report SectionTitle style) — inlined rather than imported
// from the server report-shell module, keeping this client component's bundle clean.
function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight text-gulf-teal">{children}</h2>;
}

export interface SellNowVsWaitProps {
  place: string;
  v0Estimate: { value: number; basisCount: number; asOf: string } | null;
  yoyFraction: number | null;
  yoyAsOf: string;
  defaultTaxAnnual: number | null;
  taxSource: { label: string; url: string } | null;
  /** County Tax Collector bill-lookup portal — a cited link-out, never a fetched number. */
  taxLookup: { label: string; url: string } | null;
}

const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

/** Parse a money-ish input ("$4,200" → 4200). Empty/invalid → null. */
function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
      />
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export default function SellNowVsWait(props: SellNowVsWaitProps) {
  const { place, v0Estimate, yoyFraction, yoyAsOf, defaultTaxAnnual, taxSource, taxLookup } = props;

  const [months, setMonths] = useState<Horizon>(12);
  const [v0Override, setV0Override] = useState("");
  const [insurance, setInsurance] = useState("");
  const [mortgage, setMortgage] = useState("");
  const [taxOverride, setTaxOverride] = useState("");

  const v0 = parseMoney(v0Override) ?? v0Estimate?.value ?? null;
  const taxAnnual = parseMoney(taxOverride) ?? defaultTaxAnnual;
  const insuranceAnnual = parseMoney(insurance);
  const mortgageInterestAnnual = parseMoney(mortgage);

  const result = useMemo(() => {
    if (v0 == null || v0 <= 0 || yoyFraction == null) return null;
    const inputs: SpreadInputs = {
      v0,
      yoyFraction,
      months,
      propertyTaxAnnual: taxAnnual,
      insuranceAnnual,
      mortgageInterestAnnual,
    };
    return computeSpread(inputs);
  }, [v0, yoyFraction, months, taxAnnual, insuranceAnnual, mortgageInterestAnnual]);

  return (
    <section className="mt-10">
      <SectionTitle>What waiting 6–12 months could cost or gain you</SectionTitle>

      {/* Horizon toggle */}
      <div className="mt-4 inline-flex overflow-hidden rounded-lg border border-white/10">
        {[6, 12].map((mo) => (
          <button
            key={mo}
            type="button"
            onClick={() => setMonths(mo as Horizon)}
            className={`px-4 py-1.5 text-sm ${
              months === mo ? "bg-gulf-teal/20 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {mo} months
          </button>
        ))}
      </div>

      {/* V0 — estimate + override */}
      <div className="mt-5 rounded-xl glass-card-modern border border-white/10 px-4 py-4">
        {v0Estimate ? (
          <p className="text-sm text-gray-300">
            Estimated current value:{" "}
            <span className="font-mono text-white">{usd(v0Estimate.value)}</span>{" "}
            <span className="text-gray-500">
              — estimated from {v0Estimate.basisCount} nearby sales (as of {v0Estimate.asOf}), not
              an appraisal.
            </span>
          </p>
        ) : (
          <p className="text-sm text-gray-400">
            We couldn&rsquo;t estimate a value from nearby sales — enter your own number below to
            run the spread.
          </p>
        )}
        <div className="mt-3 max-w-xs">
          <Field
            label="Use my own value"
            value={v0Override}
            onChange={setV0Override}
            placeholder={v0Estimate ? usd(v0Estimate.value) : "e.g. 450,000"}
          />
        </div>
      </div>

      {/* Inputs */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field
          label="Insurance / year (required)"
          value={insurance}
          onChange={setInsurance}
          placeholder="e.g. 4,800"
          hint="No default — Florida insurance is the worst place to guess. Add your real premium."
        />
        <Field
          label="Mortgage interest / year (optional)"
          value={mortgage}
          onChange={setMortgage}
          placeholder="e.g. 12,000"
          hint="Leave blank if none — counted as $0."
        />
        <div>
          <Field
            label="Property tax / year"
            value={taxOverride}
            onChange={setTaxOverride}
            placeholder={defaultTaxAnnual != null ? usd(defaultTaxAnnual) : "add your real bill"}
            hint={
              defaultTaxAnnual != null && taxSource
                ? `Starts from ${taxSource.label}; override with your real bill.`
                : "We don't have a live county figure yet — enter your real tax bill."
            }
          />
          {taxLookup && (
            <p className="mt-1 text-xs text-gray-500">
              <a
                href={taxLookup.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-300"
              >
                Look up your exact bill — {taxLookup.label} ↗
              </a>
            </p>
          )}
        </div>
      </div>

      {/* Projection basis + result */}
      {yoyFraction == null ? (
        <p className="mt-5 text-sm text-gray-400">
          We don&rsquo;t hold a price trend for {place} yet, so we can&rsquo;t project a value
          change here. The market snapshot above still stands.
        </p>
      ) : v0 == null || v0 <= 0 ? (
        <p className="mt-5 text-sm text-gray-400">
          Add a value above to see the projected change and the spread.
        </p>
      ) : (
        result && (
          <div className="mt-5 rounded-xl glass-card-modern border border-white/10 px-4 py-4">
            <p className="text-xs leading-5 text-gray-500">
              <span className="font-mono text-gulf-teal">{result.projectionTag}</span>{" "}
              {result.projectionBasis} {result.falsifier}
              {yoyAsOf ? ` (trend through ${monthYearLabel(yoyAsOf) || yoyAsOf}.)` : ""}
            </p>

            <ul className="mt-3 divide-y divide-white/[0.06]">
              {result.lines.map((line) => (
                <li key={line.key} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-sm text-gray-300">{line.label}</span>
                  <span className="text-right">
                    {line.amount == null ? (
                      <span className="text-xs italic text-[#e08158]">{line.note}</span>
                    ) : (
                      <span
                        className={`font-mono text-sm ${
                          line.key === "projected_change"
                            ? line.amount >= 0
                              ? "text-[#5bc97a]"
                              : "text-[#e08158]"
                            : "text-gray-200"
                        }`}
                      >
                        {line.key === "projected_change"
                          ? usd(line.amount)
                          : `− ${usd(line.amount)}`}
                        {line.note ? (
                          <span className="ml-1 text-xs not-italic text-gray-500">
                            ({line.note})
                          </span>
                        ) : null}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
              <span className="text-sm font-semibold text-white">
                {result.complete
                  ? months === 12
                    ? "Net of waiting a year"
                    : "Net of waiting six months"
                  : "Net so far (before insurance)"}
              </span>
              <span
                className={`font-mono text-lg font-bold ${
                  result.net >= 0 ? "text-[#5bc97a]" : "text-[#e08158]"
                }`}
              >
                {usd(result.net)}
              </span>
            </div>

            {!result.complete && (
              <p className="mt-2 text-xs italic text-[#e08158]">
                Add your insurance premium above to complete this — it&rsquo;s the one cost we
                won&rsquo;t guess for you.
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              A negative net means waiting is projected to cost you; a positive net means it could
              gain you. This is a projection from the past year&rsquo;s trend, not a guarantee.
            </p>
          </div>
        )
      )}
    </section>
  );
}
