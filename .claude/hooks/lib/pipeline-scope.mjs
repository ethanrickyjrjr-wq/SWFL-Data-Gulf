// .claude/hooks/lib/pipeline-scope.mjs
// Text-sliced reader for ingest/cadence_registry.yaml's source_scope block —
// see the design note in the plan Task 2 for why this isn't a real YAML parse.

/** Slice out the `- name: <dir>` entry's raw text block (up to the next
 *  top-level `- name:` line or EOF). Returns null if the dir never appears
 *  as a `- name:` value at all. */
function sliceEntry(registryYaml, pipelineDir) {
  const lines = String(registryYaml ?? "").split("\n");
  const nameRe = new RegExp(`^\\s*-\\s*name:\\s*${pipelineDir}\\s*$`);
  const anyNameRe = /^\s*-\s*name:\s*\S+\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (nameRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (anyNameRe.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** Pull one `key: "value"` (or bare, unquoted) scalar out of an already-sliced
 *  sub-block. Multi-line/folded YAML scalars are out of scope — every
 *  source_scope field in this registry is a single-line quoted string. */
function field(block, key) {
  const re = new RegExp(`^\\s*${key}:\\s*"?([^"\\n]*?)"?\\s*$`, "m");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

/** Slice the `confirmed_total:` / `source_ceiling:` sub-blocks out of an
 *  entry block (each runs until the next same-or-lower-indent `key:` line). */
function subBlock(entryBlock, key) {
  const lines = entryBlock.split("\n");
  const hdrRe = new RegExp(`^(\\s*)${key}:\\s*$`);
  let start = -1;
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = hdrRe.exec(lines[i]);
    if (m) {
      start = i;
      indent = m[1].length;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const lineIndent = lines[i].match(/^(\s*)/)[1].length;
    const isBlank = lines[i].trim() === "";
    if (!isBlank && lineIndent <= indent) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** `null` result = pipelineDir does not exist in the registry at all (the
 *  caller's "not a registered pipeline" case). `{confirmedTotal: null,
 *  sourceCeiling: null}` = registered but source_scope not researched yet —
 *  matches /ops/census's own "N/76 confirmed-total researched" honesty gap. */
export function extractSourceScope(registryYaml, pipelineDir) {
  const entry = sliceEntry(registryYaml, pipelineDir);
  if (entry === null) return null;

  const ctBlock = subBlock(entry, "confirmed_total");
  const scBlock = subBlock(entry, "source_ceiling");

  const confirmedTotal = ctBlock
    ? { summary: field(ctBlock, "summary"), source: field(ctBlock, "source") }
    : null;
  const sourceCeiling = scBlock
    ? {
        summary: field(scBlock, "summary"),
        asOf: field(scBlock, "as_of"),
        sourceUrl: field(scBlock, "source_url"),
        sourceLabel: field(scBlock, "source_label"),
      }
    : null;

  return { confirmedTotal, sourceCeiling };
}
