import fs from "fs";
import path from "path";

function extractGroupContent(svg: string, zip: string): string | null {
  const marker = ` id="${zip}"`;
  const markerIdx = svg.indexOf(marker);
  if (markerIdx === -1) return null;

  // Walk back to the opening '<' of the tag that owns this id
  let tagStart = markerIdx;
  while (tagStart > 0 && svg[tagStart] !== "<") tagStart--;

  let i = tagStart;
  let depth = 0;

  while (i < svg.length) {
    if (svg[i] !== "<") {
      i++;
      continue;
    }

    if (svg.slice(i, i + 2) === "</") {
      // Closing tag — find end
      const end = svg.indexOf(">", i);
      if (end === -1) break;
      depth--;
      if (depth === 0) return svg.slice(tagStart, end + 1);
      i = end + 1;
    } else {
      // Opening or self-closing tag
      const end = svg.indexOf(">", i);
      if (end === -1) break;
      const fragment = svg.slice(i, end + 1);
      // Comments and processing instructions don't affect depth
      if (!fragment.startsWith("<!") && !fragment.startsWith("<?")) {
        if (!fragment.endsWith("/>")) depth++;
      }
      i = end + 1;
    }
  }
  return null;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * True bounding box of every <path d="…"> in the group.
 *
 * The contractor paths are built almost entirely from RELATIVE commands
 * (`M481,256 h-1.24 l.06,2.35 v5.04 c…`). The old regex only caught absolute
 * M/L/C anchors, so for relative-heavy ZIPs (e.g. 34142) the box was tiny/wrong
 * and the rendered cutout blew up and clipped. This walks the full path grammar
 * — absolute and relative — tracking the current point, and folds in Bézier
 * control points too so curves are guaranteed inside the box.
 */
export function parseBounds(content: string): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const upd = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  };

  // Command letter OR a single number (handles glued forms like "1.5.3" and ".06")
  const tokenRe = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  const dRe = /\sd="([^"]*)"/g;
  let dm: RegExpExecArray | null;

  while ((dm = dRe.exec(content)) !== null) {
    const tokens: (string | number)[] = [];
    let t: RegExpExecArray | null;
    tokenRe.lastIndex = 0;
    while ((t = tokenRe.exec(dm[1])) !== null) {
      tokens.push(t[1] ? t[1] : parseFloat(t[2]));
    }

    let cx = 0;
    let cy = 0; // current point
    let sx = 0;
    let sy = 0; // subpath start (for Z)
    let cmd = "";
    let i = 0;

    while (i < tokens.length) {
      const tk = tokens[i];
      if (typeof tk === "string") {
        cmd = tk;
        i++;
      }
      const rel = cmd === cmd.toLowerCase();
      const take = (n: number) => {
        const arr = tokens.slice(i, i + n) as number[];
        i += n;
        return arr;
      };

      switch (cmd.toUpperCase()) {
        case "M": {
          const [x, y] = take(2);
          cx = rel ? cx + x : x;
          cy = rel ? cy + y : y;
          sx = cx;
          sy = cy;
          upd(cx, cy);
          cmd = rel ? "l" : "L"; // implicit repeats after M are line-to
          break;
        }
        case "L": {
          const [x, y] = take(2);
          cx = rel ? cx + x : x;
          cy = rel ? cy + y : y;
          upd(cx, cy);
          break;
        }
        case "H": {
          const [x] = take(1);
          cx = rel ? cx + x : x;
          upd(cx, cy);
          break;
        }
        case "V": {
          const [y] = take(1);
          cy = rel ? cy + y : y;
          upd(cx, cy);
          break;
        }
        case "C": {
          const [x1, y1, x2, y2, x, y] = take(6);
          upd(rel ? cx + x1 : x1, rel ? cy + y1 : y1);
          upd(rel ? cx + x2 : x2, rel ? cy + y2 : y2);
          cx = rel ? cx + x : x;
          cy = rel ? cy + y : y;
          upd(cx, cy);
          break;
        }
        case "S":
        case "Q": {
          const [a1, a2, x, y] = take(4);
          upd(rel ? cx + a1 : a1, rel ? cy + a2 : a2);
          cx = rel ? cx + x : x;
          cy = rel ? cy + y : y;
          upd(cx, cy);
          break;
        }
        case "T": {
          const [x, y] = take(2);
          cx = rel ? cx + x : x;
          cy = rel ? cy + y : y;
          upd(cx, cy);
          break;
        }
        case "A": {
          const a = take(7); // rx ry xrot large sweep x y
          cx = rel ? cx + a[5] : a[5];
          cy = rel ? cy + a[6] : a[6];
          upd(cx, cy);
          break;
        }
        case "Z": {
          cx = sx;
          cy = sy;
          break;
        }
        default:
          i++; // unknown token — advance to avoid an infinite loop
      }
    }
  }

  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 1190, maxY: 1237 };
  return b;
}

export interface ZipShapeResult {
  svgMarkup: string;
  found: boolean;
}

export function extractZipShape(zip: string): ZipShapeResult {
  try {
    const svgPath = path.join(process.cwd(), "public", "map", "lee-collier.svg");
    const full = fs.readFileSync(svgPath, "utf-8");
    const group = extractGroupContent(full, zip);
    if (!group) return { svgMarkup: "", found: false };

    const { minX, minY, maxX, maxY } = parseBounds(group);
    const w = maxX - minX;
    const h = maxY - minY;
    // Pad by 15% of the larger dimension, min 20 units
    const pad = Math.max(20, Math.max(w, h) * 0.15);
    const vb = `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`;

    // Strip classes/styles — the page CSS applies all visual treatment
    const cleaned = group.replace(/\sclass="[^"]*"/g, "").replace(/\sstyle="[^"]*"/g, "");

    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true">${cleaned}</svg>`;
    return { svgMarkup, found: true };
  } catch {
    return { svgMarkup: "", found: false };
  }
}
