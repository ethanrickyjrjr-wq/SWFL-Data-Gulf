import Link from "next/link";
import type { Category, LedgerItem } from "../lib/ledger";

export function Pill({ status }: { status: LedgerItem["status"] }) {
  return <span className={`pill ${status}`}>{status}</span>;
}

export function CategoryTable({ cat }: { cat: Category }) {
  if (cat.items.length === 0) {
    return (
      <p className="note">No items — signal unavailable (check env / PAT).</p>
    );
  }
  const dataCols = cat.columns.slice(1, -1); // first is the name, last is Status
  return (
    <table>
      <thead>
        <tr>
          {cat.columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cat.items.map((it) => (
          <tr key={it.id}>
            <td className="name">
              {it.link ? (
                <a href={it.link} target="_blank" rel="noreferrer">
                  {it.label}
                </a>
              ) : (
                it.label
              )}
            </td>
            {dataCols.map((c) => (
              <td key={c} className="note">
                {it.cols[c] ?? "—"}
              </td>
            ))}
            <td>
              <Pill status={it.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CategorySection({ cat }: { cat: Category }) {
  const t = tally(cat.items);
  return (
    <section className="category">
      <div className="category-header">
        <span className="cat-dot" style={{ background: cat.dot }} />
        {cat.title}
        <span className="cat-tally">
          <span style={{ color: "var(--green)" }}>{t.green}✓</span>
          <span style={{ color: "var(--yellow)" }}>{t.yellow}~</span>
          <span style={{ color: "var(--red)" }}>{t.red}✗</span>
          <span className="note">· {cat.items.length} total</span>
        </span>
      </div>
      <CategoryTable cat={cat} />
    </section>
  );
}

export function tally(items: LedgerItem[]) {
  return {
    green: items.filter((i) => i.status === "green").length,
    yellow: items.filter((i) => i.status === "yellow").length,
    red: items.filter((i) => i.status === "red").length,
  };
}

export { Link };
