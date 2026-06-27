# _ASSISTANT/ — Session Brief + Spec Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 6 tasks, 10 files, keywords: architecture

**Goal:** Auto-archive dead specs/handoffs and inject a daily brief into every Claude session via the existing session-kickoff hook.

**Architecture:** Shared pure helpers in `assistant-lib.mjs`, consumed by three scripts (first-run, weekly, new-build). Session-kickoff.mjs extended with a spec-clutter line and TODAY.md read. `_ASSISTANT/` folder is local+gitignored (except `CLEANED.md`); archive dirs are committed.

**Tech Stack:** Node.js ES modules, bun test, Supabase REST (same pattern as session-kickoff.mjs), git CLI via `execSync`.

## Global Constraints

- Never delete files — only move to `_archive/`
- `bun test scripts/assistant-lib.test.mjs` must pass after Task 2
- `--dry-run` flag on first-run and weekly scripts makes zero filesystem changes
- Session-kickoff.mjs must never throw — all new code wrapped in try/catch
- No new npm packages — only Node.js builtins already in use

---

### Task 1: Scaffolding — folders, .gitignore, CLEANED.md stub

**Files:**
- Create: `_ASSISTANT/CLEANED.md`
- Create: `docs/superpowers/specs/_archive/.gitkeep`
- Create: `docs/handoff/_archive/.gitkeep`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `_ASSISTANT/CLEANED.md` path used by all scripts as `resolve(ROOT, '_ASSISTANT/CLEANED.md')`

- [ ] **Step 1: Create the _ASSISTANT folder with CLEANED.md stub**

```bash
mkdir -p _ASSISTANT
```

Create `_ASSISTANT/CLEANED.md`:
```markdown
# CLEANED — archive log

Entries appended by `scripts/assistant-weekly.mjs` and `scripts/assistant-first-run.mjs`.
Format: `DATE  ARCHIVED  src-path\n            Reason: ...\n            → dest-path`

```

- [ ] **Step 2: Create archive destination folders**

```bash
mkdir -p docs/superpowers/specs/_archive
mkdir -p docs/handoff/_archive
```

Create `docs/superpowers/specs/_archive/.gitkeep` (empty file).
Create `docs/handoff/_archive/.gitkeep` (empty file).

- [ ] **Step 3: Add TODAY.md to .gitignore**

Add to `.gitignore` after the `.claude/` block:

```
# _ASSISTANT/ local brief — generated per-session, not committed
_ASSISTANT/TODAY.md
```

- [ ] **Step 4: Commit scaffolding**

```bash
git add _ASSISTANT/CLEANED.md docs/superpowers/specs/_archive/.gitkeep docs/handoff/_archive/.gitkeep .gitignore
git commit -m "chore(assistant): scaffold _ASSISTANT/ folder + archive dirs"
```

Expected: commit succeeds, `_ASSISTANT/TODAY.md` is gitignored.

---

### Task 2: `scripts/assistant-lib.mjs` — pure helpers + tests

**Files:**
- Create: `scripts/assistant-lib.mjs`
- Create: `scripts/assistant-lib.test.mjs`

**Interfaces:**
- Produces (consumed by Tasks 3, 4, 5, 6):
  - `specAgeInDays(filepath: string): number`
  - `specSlug(filename: string): string`
  - `gitDaysAgo(filepath: string): number`
  - `queueStatus(slug: string, queueText: string): 'done'|'building'|'next'|'mentioned'|null`
  - `isReferencedByCheck(slug: string, openCheckKeys: string[]): boolean`
  - `isDeadSpec(filepath, queueText, openCheckKeys): { dead: boolean, reason: string }`
  - `isDeadHandoff(filepath, openCheckKeys): { dead: boolean, reason: string }`
  - `archiveFile(src: string, archiveDir: string): string`
  - `appendCleaned(cleanedPath: string, entries: {src,dest,reason}[]): void`
  - `writeTodayMd(opts): void`

- [ ] **Step 1: Write the failing tests**

Create `scripts/assistant-lib.test.mjs`:

```js
import { describe, it, expect } from 'bun:test'
import {
  specAgeInDays, specSlug, queueStatus,
  isReferencedByCheck, isDeadSpec, isDeadHandoff
} from './assistant-lib.mjs'

describe('specAgeInDays', () => {
  it('returns large number for old filename date', () => {
    expect(specAgeInDays('docs/specs/2020-01-01-old-thing-design.md')).toBeGreaterThan(1000)
  })
  it('returns Infinity for filename with no date prefix', () => {
    expect(specAgeInDays('CLEANED.md')).toBe(Infinity)
  })
  it('returns ~0 for today\'s date', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(specAgeInDays(`${today}-some-thing-design.md`)).toBeLessThan(2)
  })
})

describe('specSlug', () => {
  it('strips date prefix and -design.md suffix', () => {
    expect(specSlug('2026-05-16-tool-research-personalization-design.md'))
      .toBe('tool-research-personalization')
  })
  it('strips date prefix and plain .md suffix', () => {
    expect(specSlug('2026-06-08-corridor-build-standard.md'))
      .toBe('corridor-build-standard')
  })
  it('handles basename inside a path', () => {
    expect(specSlug('docs/superpowers/specs/2026-06-08-foo-bar-design.md'))
      .toBe('foo-bar')
  })
})

describe('queueStatus', () => {
  const queue = `
- [x] **Housing brain** (housing-swfl) done
- [~] **one-assistant** building now
- [ ] **zip-report** next up
- **corridor-pulse** mentioned but no bracket
`
  it('returns done for [x] line containing a keyword from slug', () => {
    expect(queueStatus('housing-swfl', queue)).toBe('done')
  })
  it('returns building for [~] line', () => {
    expect(queueStatus('one-assistant', queue)).toBe('building')
  })
  it('returns next for [ ] line', () => {
    expect(queueStatus('zip-report', queue)).toBe('next')
  })
  it('returns null when slug keywords not found', () => {
    expect(queueStatus('completely-missing-thing', queue)).toBeNull()
  })
  it('ignores short keywords under 5 chars', () => {
    // 'zip' is 3 chars, 'report' is 6 — only 'report' matches, catches next
    expect(queueStatus('zip-report', queue)).toBe('next')
  })
})

describe('isReferencedByCheck', () => {
  it('returns true when slug is substring of a check key', () => {
    expect(isReferencedByCheck('housing-swfl', ['housing_swfl_live_verify', 'other_check']))
      .toBe(true)
  })
  it('returns false when slug not in any check key', () => {
    expect(isReferencedByCheck('old-thing', ['housing_swfl_live_verify', 'zip_report_verify']))
      .toBe(false)
  })
  it('returns false for empty check list', () => {
    expect(isReferencedByCheck('any-slug', [])).toBe(false)
  })
})

describe('isDeadSpec', () => {
  const doneQueue = '- [x] **Housing brain** (housing-swfl) done and shipped'

  it('marks spec dead when [x] in queue, no open check, old file', () => {
    // File 2020-01-01 → 1600+ days old; gitDaysAgo returns Infinity for non-existent path
    const result = isDeadSpec('2020-01-01-housing-swfl-design.md', doneQueue, [])
    expect(result.dead).toBe(true)
    expect(result.reason).toMatch(/build-queue \[x\]/)
  })

  it('keeps spec alive when referenced by open check', () => {
    const result = isDeadSpec('2020-01-01-housing-swfl-design.md', doneQueue, ['housing_swfl_live_verify'])
    expect(result.dead).toBe(false)
    expect(result.reason).toMatch(/open check/)
  })

  it('keeps spec alive when queue status is building', () => {
    const buildingQueue = '- [~] **Housing brain** (housing-swfl) in progress'
    const result = isDeadSpec('2020-01-01-housing-swfl-design.md', buildingQueue, [])
    expect(result.dead).toBe(false)
  })

  it('keeps spec alive when no queue mention and age < 60 days', () => {
    const today = new Date().toISOString().slice(0, 10)
    const result = isDeadSpec(`${today}-brand-new-design.md`, '', [])
    expect(result.dead).toBe(false)
  })

  it('marks spec dead when not in queue and age >= 60 days', () => {
    const result = isDeadSpec('2020-01-01-orphan-research-design.md', '', [])
    expect(result.dead).toBe(true)
    expect(result.reason).toMatch(/not in build-queue/)
  })
})

describe('isDeadHandoff', () => {
  it('marks SHIPPED handoff as dead', () => {
    const result = isDeadHandoff('2026-06-13-charts-rebuild-SHIPPED.md', [])
    expect(result.dead).toBe(true)
    expect(result.reason).toMatch(/signals completion/)
  })

  it('marks old handoff (>21 days) as dead when no open check', () => {
    const result = isDeadHandoff('2020-01-01-some-handoff.md', [])
    expect(result.dead).toBe(true)
    expect(result.reason).toMatch(/days old/)
  })

  it('keeps handoff alive when referenced by open check', () => {
    const result = isDeadHandoff('2020-01-01-charts-rebuild.md', ['charts_rebuild_live_verify'])
    expect(result.dead).toBe(false)
  })

  it('keeps recent handoff alive', () => {
    const today = new Date().toISOString().slice(0, 10)
    const result = isDeadHandoff(`${today}-fresh-handoff.md`, [])
    expect(result.dead).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
bun test scripts/assistant-lib.test.mjs
```

Expected: `Cannot find module './assistant-lib.mjs'`

- [ ] **Step 3: Implement `scripts/assistant-lib.mjs`**

```js
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'

export const ROOT = process.cwd()

/** Parse date from spec filename prefix. Returns Date or null. */
function parseDateFromFilename(filename) {
  const m = basename(filename).match(/^(\d{4}-\d{2}-\d{2})-/)
  return m ? new Date(m[1] + 'T00:00:00') : null
}

/** Age of file in days based on filename date prefix. Returns Infinity if no date. */
export function specAgeInDays(filepath) {
  const d = parseDateFromFilename(filepath)
  if (!d) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

/** Days since last git commit touching this file. Returns Infinity if never committed. */
export function gitDaysAgo(filepath) {
  try {
    const out = execSync(`git log --format="%ad" --date=short -1 -- "${filepath}"`, {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
    if (!out) return Infinity
    return Math.floor((Date.now() - new Date(out + 'T00:00:00').getTime()) / 86_400_000)
  } catch {
    return Infinity
  }
}

/** Extract slug from spec filename: date-slug[-design].md → slug */
export function specSlug(filename) {
  return basename(filename)
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/-design\.md$/, '')
    .replace(/\.md$/, '')
}

/**
 * Check if slug keywords appear in any build-queue line.
 * Returns 'done' | 'building' | 'next' | 'mentioned' | null
 */
export function queueStatus(slug, queueText) {
  const keywords = slug.split('-').filter(w => w.length > 4)
  if (!keywords.length) return null
  for (const line of queueText.split('\n')) {
    const lower = line.toLowerCase()
    const hit = keywords.some(k => lower.includes(k.toLowerCase()))
    if (!hit) continue
    if (/^\s*-\s*\[x\]/.test(line)) return 'done'
    if (/^\s*-\s*\[~\]/.test(line)) return 'building'
    if (/^\s*-\s*\[ \]/.test(line)) return 'next'
    return 'mentioned'
  }
  return null
}

/** Returns true if any open check key contains slug keywords. */
export function isReferencedByCheck(slug, openCheckKeys) {
  const keywords = slug.replace(/-/g, '_').split('_').filter(w => w.length > 4)
  if (!keywords.length) return false
  return openCheckKeys.some(k =>
    keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
  )
}

/** Decide if a spec should be archived. */
export function isDeadSpec(filepath, queueText, openCheckKeys) {
  const age = specAgeInDays(filepath)
  const slug = specSlug(filepath)
  const gitAge = gitDaysAgo(filepath)
  const status = queueStatus(slug, queueText)
  const checkedOut = isReferencedByCheck(slug, openCheckKeys)

  if (checkedOut) return { dead: false, reason: 'referenced by open check' }
  if (status === 'building' || status === 'next') return { dead: false, reason: `queue status: ${status}` }
  if (gitAge < 14) return { dead: false, reason: `recently touched in git (${gitAge}d ago)` }

  if (status === 'done' && age >= 14) {
    return { dead: true, reason: `build-queue [x], ${age} days old, last touched ${gitAge === Infinity ? 'never' : gitAge + 'd'} ago` }
  }
  if (status === null && age >= 60) {
    return { dead: true, reason: `not in build-queue, ${age} days old, last touched ${gitAge === Infinity ? 'never' : gitAge + 'd'} ago` }
  }
  return { dead: false, reason: `age ${age}d, status: ${status ?? 'unqueued'}` }
}

/** Decide if a handoff doc should be archived. */
export function isDeadHandoff(filepath, openCheckKeys) {
  const name = basename(filepath).toLowerCase()
  const slug = name.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')
  const age = specAgeInDays(filepath)
  const gitAge = gitDaysAgo(filepath)

  if (isReferencedByCheck(slug, openCheckKeys)) return { dead: false, reason: 'referenced by open check' }
  if (gitAge < 14) return { dead: false, reason: `recently touched in git (${gitAge}d ago)` }

  if (/shipped|done|cleanup/.test(name)) {
    return { dead: true, reason: `filename signals completion, ${age} days old` }
  }
  if (age >= 21) {
    return { dead: true, reason: `${age} days old, no open check` }
  }
  return { dead: false, reason: `age ${age}d` }
}

/** Move a file to archiveDir, preserving filename. Creates archiveDir if needed. */
export function archiveFile(src, archiveDir) {
  mkdirSync(archiveDir, { recursive: true })
  const dest = resolve(archiveDir, basename(src))
  renameSync(src, dest)
  return dest
}

/** Append archive entries to CLEANED.md. */
export function appendCleaned(cleanedPath, entries) {
  if (!entries.length) return
  const today = new Date().toISOString().slice(0, 10)
  const lines = entries.map(({ src, dest, reason }) =>
    `${today}  ARCHIVED  ${src}\n            Reason: ${reason}\n            → ${dest}`
  ).join('\n') + '\n\n'
  const existing = existsSync(cleanedPath)
    ? readFileSync(cleanedPath, 'utf8')
    : '# CLEANED — archive log\n\n'
  writeFileSync(cleanedPath, existing + lines)
}

/** Write _ASSISTANT/TODAY.md. */
export function writeTodayMd({ todayPath, date, building, overdueChecks, lastShip, specCount, candidateCount }) {
  const lines = [
    `# ${date} Brief`,
    '',
    '## In Flight',
    ...(building.length ? building.map(b => `- ${b}`) : ['- nothing marked [~] in build-queue.md']),
    '',
    '## Overdue Checks',
    ...(overdueChecks.length ? overdueChecks.map(c => `- ${c}`) : ['- none overdue']),
    '',
    '## Last Session',
    `- ${lastShip}`,
    '',
    '## Spec Health',
    `- ${specCount} specs total · ${candidateCount} candidates for archive`,
    `- run \`node scripts/assistant-weekly.mjs\` to clean`,
    '',
  ]
  mkdirSync(dirname(todayPath), { recursive: true })
  writeFileSync(todayPath, lines.join('\n'))
}
```

- [ ] **Step 4: Run tests — verify they all pass**

```bash
bun test scripts/assistant-lib.test.mjs
```

Expected: all tests pass (0 failures).

- [ ] **Step 5: Commit**

```bash
git add scripts/assistant-lib.mjs scripts/assistant-lib.test.mjs
git commit -m "feat(assistant): pure helpers — dead-spec detection, archive, cleaned log, today.md writer"
```

---

### Task 3: `scripts/assistant-first-run.mjs` — one-time full cleanup

**Files:**
- Create: `scripts/assistant-first-run.mjs`

**Interfaces:**
- Consumes: all exports from `./assistant-lib.mjs`
- Produces: archived files in `docs/superpowers/specs/_archive/` and `docs/handoff/_archive/`, updated `_ASSISTANT/CLEANED.md`

- [ ] **Step 1: Create `scripts/assistant-first-run.mjs`**

```js
#!/usr/bin/env node
// One-time cleanup: walks all specs + handoffs, archives dead ones.
// Run with --dry-run to preview without making changes.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isDeadSpec, isDeadHandoff, archiveFile, appendCleaned
} from './assistant-lib.mjs'

const ROOT = process.cwd()
const DRY_RUN = process.argv.includes('--dry-run')
const SPECS_DIR = resolve(ROOT, 'docs/superpowers/specs')
const SPECS_ARCHIVE = resolve(ROOT, 'docs/superpowers/specs/_archive')
const HANDOFF_DIR = resolve(ROOT, 'docs/handoff')
const HANDOFF_ARCHIVE = resolve(ROOT, 'docs/handoff/_archive')
const QUEUE_PATH = resolve(ROOT, '_AUDIT_AND_ROADMAP/build-queue.md')
const CLEANED_PATH = resolve(ROOT, '_ASSISTANT/CLEANED.md')
const SECRETS_PATH = resolve(ROOT, '.dlt/secrets.toml')

function parseTomlStr(toml, key) {
  const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'))
  return m?.[1] ?? null
}

async function getOpenCheckKeys() {
  try {
    const secrets = readFileSync(SECRETS_PATH, 'utf8')
    const sbUrl = parseTomlStr(secrets, 'SUPABASE_URL') ?? parseTomlStr(secrets, 'BRAINS_SUPABASE_URL')
    const sbKey = parseTomlStr(secrets, 'SUPABASE_SERVICE_KEY') ?? parseTomlStr(secrets, 'BRAINS_SUPABASE_SERVICE_KEY')
    if (!sbUrl || !sbKey) return []
    const res = await fetch(
      `${sbUrl}/rest/v1/checks?state=eq.open&select=check_key&limit=200`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    )
    if (!res.ok) return []
    return (await res.json()).map(r => r.check_key)
  } catch {
    return []
  }
}

async function main() {
  if (DRY_RUN) console.log('[DRY RUN] No files will be moved.\n')

  const queueText = existsSync(QUEUE_PATH) ? readFileSync(QUEUE_PATH, 'utf8') : ''
  const openCheckKeys = await getOpenCheckKeys()
  console.log(`Open check keys loaded: ${openCheckKeys.length}`)

  const entries = []

  // Scan specs (skip _archive/ dir)
  const specs = readdirSync(SPECS_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  console.log(`\nScanning ${specs.length} specs...`)
  let specCandidates = 0
  for (const f of specs) {
    const filepath = resolve(SPECS_DIR, f)
    const { dead, reason } = isDeadSpec(filepath, queueText, openCheckKeys)
    if (!dead) continue
    specCandidates++
    console.log(`  ARCHIVE: ${f}\n           ${reason}`)
    if (!DRY_RUN) {
      const dest = archiveFile(filepath, SPECS_ARCHIVE)
      entries.push({ src: filepath, dest, reason })
    }
  }
  console.log(`  → ${specCandidates} specs to archive`)

  // Scan handoffs (skip _archive/ dir)
  const handoffs = readdirSync(HANDOFF_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  console.log(`\nScanning ${handoffs.length} handoff docs...`)
  let handoffCandidates = 0
  for (const f of handoffs) {
    const filepath = resolve(HANDOFF_DIR, f)
    const { dead, reason } = isDeadHandoff(filepath, openCheckKeys)
    if (!dead) continue
    handoffCandidates++
    console.log(`  ARCHIVE: ${f}\n           ${reason}`)
    if (!DRY_RUN) {
      const dest = archiveFile(filepath, HANDOFF_ARCHIVE)
      entries.push({ src: filepath, dest, reason })
    }
  }
  console.log(`  → ${handoffCandidates} handoffs to archive`)

  if (!DRY_RUN && entries.length) {
    appendCleaned(CLEANED_PATH, entries)
    console.log(`\nDone. Archived ${entries.length} files. CLEANED.md updated.`)
    console.log('Commit the archive moves: git add -A && git commit -m "chore(assistant): archive dead specs + handoffs"')
  } else {
    console.log(`\n${DRY_RUN ? '[DRY RUN] Would archive' : 'Archived'} ${entries.length} files.`)
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
```

- [ ] **Step 2: Dry-run to verify it finds dead specs without touching anything**

```bash
node scripts/assistant-first-run.mjs --dry-run
```

Expected: lists specs/handoffs that would be archived. No files moved. Output ends with `[DRY RUN] Would archive N files.`

- [ ] **Step 3: Run for real**

```bash
node scripts/assistant-first-run.mjs
```

Expected: files moved to `_archive/` dirs, CLEANED.md updated. Output ends with `Done. Archived N files.`

- [ ] **Step 4: Commit archive moves + CLEANED.md**

```bash
git add docs/superpowers/specs/_archive/ docs/handoff/_archive/ _ASSISTANT/CLEANED.md
git commit -m "chore(assistant): archive dead specs + handoffs (first-run cleanup)"
```

- [ ] **Step 5: Commit the script itself**

```bash
git add scripts/assistant-first-run.mjs
git commit -m "feat(assistant): first-run cleanup script"
```

---

### Task 4: `scripts/assistant-weekly.mjs` — incremental cleanup + TODAY.md

**Files:**
- Create: `scripts/assistant-weekly.mjs`

**Interfaces:**
- Consumes: all exports from `./assistant-lib.mjs`
- Produces: incremental archive moves + updated `_ASSISTANT/TODAY.md` (local, gitignored)

- [ ] **Step 1: Create `scripts/assistant-weekly.mjs`**

```js
#!/usr/bin/env node
// Weekly maintenance: archive any newly-dead specs/handoffs, write _ASSISTANT/TODAY.md.
// Re-runnable at any time. Safe to run without --dry-run.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isDeadSpec, isDeadHandoff, archiveFile, appendCleaned, writeTodayMd
} from './assistant-lib.mjs'

const ROOT = process.cwd()
const DRY_RUN = process.argv.includes('--dry-run')
const SPECS_DIR = resolve(ROOT, 'docs/superpowers/specs')
const SPECS_ARCHIVE = resolve(ROOT, 'docs/superpowers/specs/_archive')
const HANDOFF_DIR = resolve(ROOT, 'docs/handoff')
const HANDOFF_ARCHIVE = resolve(ROOT, 'docs/handoff/_archive')
const QUEUE_PATH = resolve(ROOT, '_AUDIT_AND_ROADMAP/build-queue.md')
const CLEANED_PATH = resolve(ROOT, '_ASSISTANT/CLEANED.md')
const TODAY_PATH = resolve(ROOT, '_ASSISTANT/TODAY.md')
const LOG_PATH = resolve(ROOT, 'SESSION_LOG.md')
const SECRETS_PATH = resolve(ROOT, '.dlt/secrets.toml')

function parseTomlStr(toml, key) {
  const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'))
  return m?.[1] ?? null
}

async function getOpenChecks() {
  try {
    const secrets = readFileSync(SECRETS_PATH, 'utf8')
    const sbUrl = parseTomlStr(secrets, 'SUPABASE_URL') ?? parseTomlStr(secrets, 'BRAINS_SUPABASE_URL')
    const sbKey = parseTomlStr(secrets, 'SUPABASE_SERVICE_KEY') ?? parseTomlStr(secrets, 'BRAINS_SUPABASE_SERVICE_KEY')
    if (!sbUrl || !sbKey) return { keys: [], overdue: [] }
    const res = await fetch(
      `${sbUrl}/rest/v1/checks?state=eq.open&select=check_key,label,due_at&order=due_at.asc.nullslast&limit=200`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    )
    if (!res.ok) return { keys: [], overdue: [] }
    const rows = await res.json()
    const today = new Date().toISOString().slice(0, 10)
    return {
      keys: rows.map(r => r.check_key),
      overdue: rows
        .filter(r => r.due_at && r.due_at < today)
        .map(r => `[${r.check_key}] ${r.label} (due ${r.due_at})`)
    }
  } catch {
    return { keys: [], overdue: [] }
  }
}

function extractLastShip(logText) {
  const parts = logText.split(/\n(?=## \d{4}-\d{2}-\d{2})/)
  const first = parts.find(p => /^## \d{4}-\d{2}-\d{2}/.test(p)) ?? ''
  return (first.match(/^## [^\n]+/)?.[0] ?? '').replace(/^## /, '')
}

function parseBuildingItems(queueText) {
  const items = []
  for (const line of queueText.split('\n')) {
    if (/^\s*-\s*\[~\]/.test(line)) {
      // Extract just the bold title portion
      const m = line.match(/\*\*([^*]+)\*\*/)
      items.push(m ? m[1] : line.replace(/^\s*-\s*\[~\]\s*/, '').slice(0, 80))
    }
  }
  return items
}

async function main() {
  if (DRY_RUN) console.log('[DRY RUN] No files will be moved.\n')

  const queueText = existsSync(QUEUE_PATH) ? readFileSync(QUEUE_PATH, 'utf8') : ''
  const { keys: openCheckKeys, overdue: overdueChecks } = await getOpenChecks()
  const lastShip = existsSync(LOG_PATH) ? extractLastShip(readFileSync(LOG_PATH, 'utf8')) : '(none)'
  const today = new Date().toISOString().slice(0, 10)

  const entries = []

  // Scan specs
  const specs = readdirSync(SPECS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))
  let specCandidates = 0
  for (const f of specs) {
    const filepath = resolve(SPECS_DIR, f)
    const { dead, reason } = isDeadSpec(filepath, queueText, openCheckKeys)
    if (!dead) continue
    specCandidates++
    console.log(`ARCHIVE spec: ${f} — ${reason}`)
    if (!DRY_RUN) {
      const dest = archiveFile(filepath, SPECS_ARCHIVE)
      entries.push({ src: filepath, dest, reason })
    }
  }

  // Scan handoffs
  const handoffs = readdirSync(HANDOFF_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))
  for (const f of handoffs) {
    const filepath = resolve(HANDOFF_DIR, f)
    const { dead, reason } = isDeadHandoff(filepath, openCheckKeys)
    if (!dead) continue
    console.log(`ARCHIVE handoff: ${f} — ${reason}`)
    if (!DRY_RUN) {
      const dest = archiveFile(filepath, HANDOFF_ARCHIVE)
      entries.push({ src: filepath, dest, reason })
    }
  }

  if (!DRY_RUN && entries.length) {
    appendCleaned(CLEANED_PATH, entries)
  }

  // Recount live specs after potential moves
  const liveSpecs = readdirSync(SPECS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))

  // Write TODAY.md
  if (!DRY_RUN) {
    writeTodayMd({
      todayPath: TODAY_PATH,
      date: today,
      building: parseBuildingItems(queueText),
      overdueChecks,
      lastShip,
      specCount: liveSpecs.length,
      candidateCount: specCandidates,
    })
    console.log(`\nTODAY.md written to _ASSISTANT/TODAY.md`)
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] Would archive' : 'Archived'} ${entries.length} files.`)
  if (!DRY_RUN && entries.length) {
    console.log('Commit archive moves: git add -A && git commit -m "chore(assistant): weekly archive pass"')
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
```

- [ ] **Step 2: Dry-run to verify output**

```bash
node scripts/assistant-weekly.mjs --dry-run
```

Expected: shows any candidates, prints `[DRY RUN] Would archive N files.` No TODAY.md written.

- [ ] **Step 3: Run for real and verify TODAY.md is written**

```bash
node scripts/assistant-weekly.mjs
cat _ASSISTANT/TODAY.md
```

Expected: `_ASSISTANT/TODAY.md` exists, starts with `# YYYY-MM-DD Brief`, contains In Flight / Overdue Checks / Last Session / Spec Health sections.

- [ ] **Step 4: Commit**

```bash
git add scripts/assistant-weekly.mjs
git commit -m "feat(assistant): weekly script — incremental archive + TODAY.md writer"
```

---

### Task 5: `scripts/new-build.mjs` — spec stub + check opener

**Files:**
- Create: `scripts/new-build.mjs`

**Interfaces:**
- Consumes: `scripts/check.mjs` (via `execSync`), Node.js `fs`
- Produces: `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md` stub + opens a check in Supabase

- [ ] **Step 1: Create `scripts/new-build.mjs`**

```js
#!/usr/bin/env node
// Create a new build spec stub + open the corresponding check in one command.
// Usage: node scripts/new-build.mjs <slug> "<label>"
// Example: node scripts/new-build.mjs zip-report-rebuild "Rich /r/zip-report page"

import { writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const [,, slug, ...rest] = process.argv
const label = rest.join(' ').replace(/^"|"$/g, '')

if (!slug || !label) {
  console.error('Usage: node scripts/new-build.mjs <slug> "<label>"')
  console.error('Example: node scripts/new-build.mjs zip-report-rebuild "Rich /r/zip-report page"')
  process.exit(1)
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error('Slug must be lowercase letters, numbers, and hyphens only.')
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const specPath = resolve(ROOT, `docs/superpowers/specs/${today}-${slug}-design.md`)

if (existsSync(specPath)) {
  console.error(`Spec already exists: ${specPath}`)
  process.exit(1)
}

const stub = [
  `# ${label}`,
  '',
  `**Date:** ${today}`,
  '',
  '## Problem',
  '',
  '## Goal',
  '',
  '## What we\'re building',
  '',
].join('\n')

writeFileSync(specPath, stub)
console.log(`Created: ${specPath}`)

// Open check — uses the same check.mjs pattern already in the project
const checkKey = `${slug.replace(/-/g, '_')}_live_verify`
try {
  execSync(
    `node scripts/check.mjs open brain-platform ${checkKey} "${label} live-verify"`,
    { cwd: ROOT, stdio: 'inherit' }
  )
} catch {
  // check.mjs already prints its own error; exit 1 means key existed or creds missing
  console.error(`Warning: check '${checkKey}' may already exist or creds unavailable.`)
}
```

- [ ] **Step 2: Test the script with a dummy build**

```bash
node scripts/new-build.mjs test-widget "Test Widget live-verify check"
```

Expected: 
- `docs/superpowers/specs/2026-06-27-test-widget-design.md` created with stub content
- check `test_widget_live_verify` opened in Supabase (or error printed if already exists)

- [ ] **Step 3: Verify spec stub exists**

```bash
cat docs/superpowers/specs/2026-06-27-test-widget-design.md
```

Expected: stub with `# Test Widget`, `**Date:** 2026-06-27`, empty Problem/Goal/What sections.

- [ ] **Step 4: Clean up test spec and check, then commit**

```bash
rm docs/superpowers/specs/2026-06-27-test-widget-design.md
node scripts/check.mjs close test_widget_live_verify "test cleanup"
git add scripts/new-build.mjs
git commit -m "feat(assistant): new-build.mjs — spec stub + check opener in one command"
```

---

### Task 6: Extend `scripts/session-kickoff.mjs` with spec clutter line + TODAY.md

**Files:**
- Modify: `scripts/session-kickoff.mjs`

**Interfaces:**
- Consumes: `_ASSISTANT/TODAY.md` (if exists and dated today), `docs/superpowers/specs/` (dir listing)
- Produces: extended KICKOFF output with spec clutter line + TODAY.md section

- [ ] **Step 1: Add `readdirSync` and `existsSync` to the fs import in session-kickoff.mjs**

Find line 7:
```js
import { readFileSync } from "node:fs";
```

Replace with:
```js
import { readFileSync, readdirSync, existsSync } from "node:fs";
```

- [ ] **Step 2: Add spec clutter count function**

After the `chronicFlappers` import block (around line 10), add:

```js
const SPECS_DIR = resolve(ROOT, "docs/superpowers/specs");
const TODAY_PATH = resolve(ROOT, "_ASSISTANT/TODAY.md");

function specClutterLine() {
  try {
    const all = readdirSync(SPECS_DIR).filter(
      (f) => f.endsWith(".md") && !f.startsWith("_"),
    );
    return `Spec clutter : ${all.length} specs · run \`node scripts/assistant-weekly.mjs\` to clean\n`;
  } catch {
    return "";
  }
}

function todayMdBlock(today) {
  try {
    if (!existsSync(TODAY_PATH)) return "";
    const content = readFileSync(TODAY_PATH, "utf8");
    if (!content.startsWith(`# ${today}`)) return ""; // stale
    return `\n--- TODAY.md ---\n${content}\n`;
  } catch {
    return "";
  }
}
```

- [ ] **Step 3: Call the new functions inside `main()` before the `process.stdout.write` call**

In `main()`, after the `flappersLine` computation (around line 129), add:

```js
  const clutterLine = specClutterLine();
  const todayBlock = todayMdBlock(today);
```

- [ ] **Step 4: Add clutterLine and todayBlock to the output**

Find the `process.stdout.write(...)` block (around line 134). Replace with:

```js
  process.stdout.write(
    `\n${banner}\n` +
      `KICKOFF — ${today} · brain-platform · main\n` +
      `Paste below as your first message, or just type "go" / describe the task.\n` +
      `${banner}\n\n` +
      `Last shipped : ${lastShip}\n` +
      `Open checks  : ${checksLine}\n` +
      `Build queue  : ${queueLine}\n` +
      clutterLine +
      flappersLine +
      todayBlock +
      `\nWhat should we work on?\n` +
      `${banner}\n`,
  );
```

- [ ] **Step 5: Run session-kickoff.mjs and verify the new line appears**

```bash
node scripts/session-kickoff.mjs
```

Expected: output includes a `Spec clutter :` line after `Build queue`. If `_ASSISTANT/TODAY.md` was written today by assistant-weekly, its content also appears.

- [ ] **Step 6: Commit**

```bash
git add scripts/session-kickoff.mjs
git commit -m "feat(assistant): session-kickoff shows spec clutter count + TODAY.md block"
```

---

## Self-Review

**Spec coverage:**
- ✅ Session brief extension (session-kickoff) → Task 6
- ✅ `_ASSISTANT/` folder + CLEANED.md → Task 1
- ✅ TODAY.md written by weekly script → Task 4
- ✅ `assistant-first-run.mjs` → Task 3
- ✅ `assistant-weekly.mjs` → Task 4
- ✅ `new-build.mjs` → Task 5
- ✅ `.gitignore` addition → Task 1
- ✅ Archive dirs committed → Task 1
- ✅ Dead spec criteria (all 3 conditions) → Task 2 `isDeadSpec`
- ✅ Dead handoff criteria → Task 2 `isDeadHandoff`
- ✅ `--dry-run` flag → Tasks 3 + 4

**Placeholder scan:** none found.

**Type consistency:**
- `writeTodayMd` called in Task 4 with `{ todayPath, date, building, overdueChecks, lastShip, specCount, candidateCount }` — matches signature defined in Task 2 ✅
- `isDeadSpec(filepath, queueText, openCheckKeys)` — used in Tasks 3+4, defined in Task 2 ✅
- `isDeadHandoff(filepath, openCheckKeys)` — used in Tasks 3+4, defined in Task 2 ✅
- `archiveFile(src, archiveDir)` — used in Tasks 3+4, defined in Task 2 ✅
- `appendCleaned(cleanedPath, entries)` — used in Tasks 3+4, defined in Task 2 ✅
