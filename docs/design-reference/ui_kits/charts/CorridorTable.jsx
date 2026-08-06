/* global React */
const { useState, useMemo } = React;

// ============================================================
// CorridorTable — sortable audit table (Tier 3 vibe).
// Click a row to select; row highlights match scatter + map.
// ============================================================

const COLUMNS = [
  { k: "name",     label: "Corridor",     align: "left",  sort: (a, b) => a.name.localeCompare(b.name) },
  { k: "county",   label: "County",       align: "left",  sort: (a, b) => a.county.localeCompare(b.county) },
  { k: "type",     label: "Type",         align: "left",  sort: (a, b) => a.type.localeCompare(b.type) },
  { k: "capRate",  label: "Cap",          align: "right", sort: (a, b) => (a.metrics?.capRate.val    ?? 99) - (b.metrics?.capRate.val    ?? 99) },
  { k: "vacancy",  label: "Vac",          align: "right", sort: (a, b) => (a.metrics?.vacancy.val    ?? 99) - (b.metrics?.vacancy.val    ?? 99) },
  { k: "absorption", label: "Absorption", align: "right", sort: (a, b) => (a.metrics?.absorption.val ?? -1e9) - (b.metrics?.absorption.val ?? -1e9) },
  { k: "rent",     label: "Rent PSF",     align: "right", sort: (a, b) => (a.metrics?.rent.val       ?? 0) - (b.metrics?.rent.val       ?? 0) },
  { k: "seasonal", label: "Season",       align: "right", sort: (a, b) => a.seasonalIdx - b.seasonalIdx },
  { k: "flags",    label: "Flags",        align: "right", sort: (a, b) => a.flags.length - b.flags.length },
];

window.CorridorTable = function CorridorTable({ selectedId, onSelect, hoveredId, onHover, palette }) {
  const [sortKey, setSortKey] = useState("capRate");
  const [sortDir, setSortDir] = useState("asc");

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.k === sortKey);
    const arr = [...window.CORRIDORS].sort(col.sort);
    return sortDir === "desc" ? arr.reverse() : arr;
  }, [sortKey, sortDir]);

  const onHeaderClick = (k) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const fmtSimple = (m, suf = "") => m ? m.val.toFixed(m.unit === "$/sf" ? 2 : 1) + suf : "—";
  const fmtAbs = (m) => m ? m.val.toLocaleString() : "—";

  return (
    <div className="cv-table-wrap">
      <table className="cv-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.k}
                onClick={() => onHeaderClick(c.k)}
                style={{ textAlign: c.align, cursor: "pointer" }}
                className={sortKey === c.k ? "is-sort" : ""}
              >
                {c.label}
                {sortKey === c.k && <span className="cv-sort-ind"> {sortDir === "asc" ? "↑" : "↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const isSelected = selectedId === c.id;
            const isHovered = hoveredId === c.id;
            const evColor = palette[c.evolution];
            return (
              <tr
                key={c.id}
                className={"cv-trow" + (isSelected ? " is-selected" : "") + (isHovered ? " is-hovered" : "")}
                onClick={() => onSelect(c.id)}
                onMouseEnter={() => onHover(c.id)}
                onMouseLeave={() => onHover(null)}
              >
                <td className="cv-tcell-name">
                  <span className="cv-evo-dot" style={{ background: evColor }} />
                  {c.short}
                </td>
                <td className="cv-tcell-faint">{c.county === "lee" ? "Lee" : "Collier"}</td>
                <td className="cv-tcell-faint">{c.type.replace(/-/g, " ")}</td>
                <td className="cv-tcell-num">{fmtSimple(c.metrics?.capRate, "%")}</td>
                <td className="cv-tcell-num">{fmtSimple(c.metrics?.vacancy, "%")}</td>
                <td className="cv-tcell-num">{fmtAbs(c.metrics?.absorption)}</td>
                <td className="cv-tcell-num">{c.metrics ? "$" + c.metrics.rent.val.toFixed(2) : "—"}</td>
                <td className="cv-tcell-num">{c.seasonalIdx.toFixed(2)}</td>
                <td className="cv-tcell-flags">
                  {c.flags.length === 0 ? <span style={{ color: "var(--text-tertiary)" }}>—</span> : (
                    <span className="cv-flag-count">
                      {c.flags.map((f, i) => (
                        <span key={i} className="cv-flag-pip" style={{ background: palette["flag_" + f.type] || window.FLAG_TYPES[f.type].color }} title={window.FLAG_TYPES[f.type].label} />
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="cv-table-foot">
        <span className="caption">Click column header to sort · click row to inspect · {window.CORRIDORS.length} corridors total</span>
      </div>
    </div>
  );
};
