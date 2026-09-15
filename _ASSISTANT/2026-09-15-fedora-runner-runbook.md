# Fedora self-hosted GitHub Actions runner — setup runbook

**Prep-only document.** Written from a cloud sandbox with no network path to `ssh fedora` (confirmed
by a prior session today — see `_ASSISTANT/2026-09-15-fedora-network-and-data-integrity-handoff.md`
Thread A). Nothing below has been executed. Ricky runs this himself, in order, in one `ssh fedora`
session. Every command is copy-paste; every check states the exact pass/fail string to look for so
there's nothing to interpret alone.

**Repo:** `https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf` (confirmed public — see the same
handoff file, item 2).

**Why:** DBPR SIRS, Crexi, Collier official records, and Collier permits get WAF/bot-blocked from
GitHub's shared-IP `ubuntu-latest` runners. Fedora's Xfinity residential IP fixes that for (at least)
the first three — see the per-pipeline notes in §3 for what each block actually looks like and, for
Collier permits, a flag that its mechanism is different. This plan is decided, not being
re-litigated here; this doc is only the checklist.

## Run order — not the section order below

Sections are numbered to match what was asked (install → runtime → connectivity → register), but
**run them 2 → 3 → 1(finish) → 4**, with 1a (download only) done early since it's harmless to have
the tarball sitting there. Reason: the GitHub registration token is **1-hour TTL** (confirmed live
from docs.github.com, see §1). `uv python install`, the venv build, and `crawl4ai-setup`'s Chromium
download can eat a chunk of that hour — don't burn the token on that. And if §3 fails (Fedora's IP
still gets blocked), stop: registering a runner that can't do the job is wasted time. Concretely:

1. §2 — get Python/crawl4ai/Playwright working rootless.
2. §3 — prove the 4 pipelines' own `--dry-run`s actually clear the WAFs from this box.
3. §1 — get a fresh token from the live GitHub page, finish `config.sh`, install the systemd --user
   service.
4. §4 — labels + scope confirmation.

## What's already true going in (don't re-derive, cite these)

- Two of the four workflows **already** target a self-hosted runner labeled `swfl-local` — it's
  currently Ricky's **Windows** box, and it's offline: `.github/workflows/dbpr-sirs-monthly.yml` and
  `.github/workflows/ingest-crexi-listings.yml`, both `runs-on: [self-hosted, swfl-local]`.
- `.github/workflows/ingest-collier-official-records.yml` and
  `.github/workflows/collier-permits-monthly.yml` still say `runs-on: ubuntu-latest`. This runbook
  stands the runner up — it does **not** repoint those two YAML files. That's a follow-up (see end).
- `wiki/pipeline-health.md`'s decision log already says "Fedora stands up as the `swfl-local`
  residential-IP runner ... then the Windows runner retires" — so §4 reuses that label, it does not
  invent a new one.
- **crawl4ai runs IN-PROCESS SDK ONLY in this repo, never its own HTTP/docker server** —
  `ingest/lib/crawl_client.py` lines 11-19 carry an explicit LANDMINE: the stealth/interactive
  crawling this repo does (`js_code`, `proxy_config`, `cookies`) is rejected with HTTP 400 by
  crawl4ai's 0.9.0 remote server. Whatever runs these pipelines — bare venv or a podman container —
  it's always `python -m ingest.pipelines.<name>.pipeline`, never a request to a crawl4ai server.
  This is why §2 doesn't reach for "pull the crawl4ai Docker image" — there's no such consumer here.
- **Collier permits is currently green on `ubuntu-latest`**, not currently broken: its own docstring
  (`ingest/pipelines/collier_permits/fetcher.py` lines 6-9) says Akamai blocks colliercountyfl.gov
  "by TLS/JA3 fingerprint from any IP (datacenter and residential; confirmed 2026-06-14)" — the
  `UndetectedAdapter` already defeats that on GHA today (runs `31565435973`, `31566832140`,
  `31567459230`, all cited in `collier-permits-monthly.yml`'s own comments). **Verified: the other
  three need a residential IP. Needs review: whether Collier permits needs Fedora at all, or whether
  this is consolidation/hygiene** (per the decision log) rather than an active fix. Run its §3 test
  anyway since it's in scope, but don't be surprised it already passes today from `ubuntu-latest` too.

---

## §1 — Install the runner as a user-level systemd service (no sudo)

### 1a. Download (do this part early; harmless to sit idle)

GitHub's own docs do **not** publish a static version-pinned download command — confirmed live
2026-09-15 against `docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners`:
the actual filename, version, and token are generated fresh on the repo's own UI page, not printable
here without risking a stale version. So:

1. In a browser, go to `https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/settings/actions/runners/new`,
   pick **Linux**, architecture **x64** (confirm first: `uname -m` on Fedora should print `x86_64`;
   if it prints `aarch64` pick ARM64 on the page instead).
2. Copy that page's own "Download" commands verbatim into the shell — they'll look like the
   structure below, but copy the page's actual version number, not this one:
   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner-linux-x64-<VERSION>.tar.gz -L \
     https://github.com/actions/runner/releases/download/v<VERSION>/actions-runner-linux-x64-<VERSION>.tar.gz
   tar xzf ./actions-runner-linux-x64-<VERSION>.tar.gz
   ```
3. **Stop there.** Do not run the page's `./config.sh` line yet — the token on that page is good for
   1 hour; go do §2 and §3 first, then come back to §1b/§4b once the environment is proven. If more
   than an hour passes, reload the page for a fresh token before running `config.sh`.

### 1b. Do NOT use the runner's built-in service installer

GitHub's official service step is `sudo ./svc.sh install` — confirmed live 2026-09-15 against
`docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service`:
every documented form (default, or `./svc.sh install USERNAME`) requires `sudo` for `install`,
`start`, `status`, `stop`, `uninstall`. Since the requirement here is no-sudo, skip `svc.sh`
entirely and run `run.sh` under a `systemd --user` unit instead (standard Linux pattern, not a
vendor-versioned surface, safe to write directly):

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/gha-runner.service <<'EOF'
[Unit]
Description=GitHub Actions Runner (swfl-local, Fedora)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=%h/actions-runner
ExecStart=%h/actions-runner/run.sh
Restart=always
RestartSec=10
KillMode=process
KillSignal=SIGINT

[Install]
WantedBy=default.target
EOF

loginctl enable-linger "$(whoami)"   # lets the service run without an active login session —
                                      # this is the one place a polkit prompt may appear; that's
                                      # expected and is not the same thing as sudo-ing the runner
systemctl --user daemon-reload
```

Don't `enable --now` yet — the runner isn't `config.sh`'d until §4b. Come back here after §4b to
start it (§4c).

---

## §2 — Runtime: get Python/crawl4ai/Playwright working rootless, no container by default

All four pipelines call crawl4ai as an in-process Python library (see "what's already true" above).
Native path first; podman is a **fallback**, only if the native Chromium launch reports a missing
shared library that Fedora doesn't ship (it likely does — Fedora 44 Workstation carries GTK/NSS/ATK
already; Fedora Server may not).

### 2a. Python 3.12 via `uv`, no sudo

The repo pins Python 3.12 exactly (`ingest/CLAUDE.md`: Fedora's newer system Python has no prebuilt
`lxml` wheel, which silently breaks the build). `uv` installs user-level, no sudo — confirmed live
2026-09-15 against `docs.astral.sh/uv/getting-started/installation`:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
exec $SHELL -l   # reload so ~/.local/bin is on PATH
uv python install 3.12
```

### 2b. A dedicated venv outside the repo, pinned by absolute path

Mirrors the pattern the (offline) Windows runner already uses (`sirs-runner-venv`,
`crexi-runner-venv` — see `dbpr-sirs-monthly.yml` / `ingest-crexi-listings.yml`), so the eventual
workflow-file change is a one-line `VENV_PY` swap, not a redesign:

```bash
git clone https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf.git ~/swfl-test-checkout
cd ~/swfl-test-checkout
uv venv ~/swfl-runner-venv --python 3.12
uv pip install --python ~/swfl-runner-venv/bin/python -r ingest/requirements.txt
```

### 2c. Install crawl4ai's browser + preflight — same two commands the GHA `ubuntu-latest` jobs
already run successfully today (`ingest-collier-official-records.yml`,
`collier-permits-monthly.yml`), so a pass here means Fedora matches known-good:

```bash
~/swfl-runner-venv/bin/crawl4ai-setup
# downloads Chromium to ~/.cache/ms-playwright — the download itself needs no sudo; only the
# separate `--with-deps` / `install-deps` system-library step would, and that step is apt-based
# (Debian/Ubuntu) — it does not target Fedora's dnf package names at all, which is the real reason
# §2e below falls back to a container instead of hunting for dnf equivalents.

~/swfl-runner-venv/bin/crawl4ai-doctor
```
**PASS:** ends without a `FAIL` line (mirrors the "crawl4ai preflight" step already green in
`ingest-collier-official-records.yml`). **FAIL:** any line naming a missing shared library
(`libnss3.so`, `libatk-1.0.so.0`, `libgtk-3.so.0`, etc.) — that's the trigger for §2e, and the exact
names are what a fallback container needs to provide.

### 2d. Belt-and-suspenders: launch a real headless browser and print its version

```bash
~/swfl-runner-venv/bin/python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    print('OK', b.version)
    b.close()
"
```
**PASS:** prints `OK 12x.0.xxxx.xx` (a Chromium version string). **FAIL:** a traceback naming a
missing `.so` — same signal as 2c, go to 2e.

### 2e. Podman fallback — only if 2c/2d failed on a missing shared library

```bash
podman --version                                        # Fedora ships this by default
podman info --format '{{.Host.Security.Rootless}}'      # expect: true
grep "$(whoami)" /etc/subuid /etc/subgid                # expect one line each — needed for
                                                          # rootless user namespaces; usually
                                                          # already configured on Fedora Workstation
```
Rootless on the **host** still means root **inside** the container's own user namespace — that's
why `crawl4ai-setup`'s apt-based system-lib install works inside a Debian-based container without
ever touching host sudo. Build (don't pull a stranger's prebuilt image) a container that mirrors
exactly what the already-green `ubuntu-latest` jobs do:

```bash
mkdir -p ~/swfl-runner-container && cd ~/swfl-runner-container
cp ~/swfl-test-checkout/ingest/requirements.txt .
cat > Containerfile <<'EOF'
FROM python:3.12-slim-bookworm
WORKDIR /work
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && crawl4ai-setup
EOF
# confirm the base tag still resolves before building (don't trust this tag from memory either):
podman search --list-tags docker.io/library/python 2>/dev/null | grep 3.12-slim-bookworm || \
  skopeo inspect docker://docker.io/library/python:3.12-slim-bookworm >/dev/null && echo "tag OK"

podman build -t swfl-ingest:local .
podman run --rm swfl-ingest:local crawl4ai-doctor   # same PASS bar as 2c
```
**LANDMINE (repeat):** this container runs the pipeline's own Python process inside it
(`podman run ... python -m ingest.pipelines.<name>.pipeline`) — never crawl4ai's HTTP server mode.
If §2 needed this fallback, use `podman run --rm -v ~/swfl-test-checkout:/work:Z -w /work
swfl-ingest:local <cmd>` in place of the bare `~/swfl-runner-venv/bin/python` calls everywhere in §3.

---

## §3 — Prove the container/venv actually clears the WAFs from this IP

This is the step that decides whether finishing §1/§4 is worth it. Run from `~/swfl-test-checkout`.

### 3a. Cheap plumbing check (NOT a WAF-clearance test — just confirms which IP is leaving the box)

```bash
curl -s https://api.ipify.org ; echo
# PASS: prints Ricky's Xfinity WAN IP (not a datacenter/cloud range).

env | grep -i crawl4ai || echo "clean — CRAWL4AI_PROXY not set (correct)"
```
**PASS:** `clean — ...`. If `CRAWL4AI_PROXY` is set to anything, unset it. Both
`dbpr-sirs-monthly.yml` and `ingest-crexi-listings.yml` carry 08/06/2026 postmortems where this
exact var — even just present in the repo's secrets — silently routed traffic through the Webshare
shared proxy pool and defeated the entire point of a residential-IP runner. Don't export it in this
shell, and don't create `~/actions-runner/.env` with a proxy line (the runner injects that file into
every job it runs).

### 3b. Real proof — each pipeline's own `--dry-run`. Curl-testing these endpoints directly is
actively misleading on 3 of the 4 (see the note under each) — the pipeline run is the only valid
signal.

```bash
# Only needed if a bare run errors before reaching the network (reads secrets.toml/env at import) —
# crexi's dry-run specifically does NOT touch the DB: upsert_rows/close_unseen both check dry_run
# before opening a connection (ingest/pipelines/crexi_listings/distill.py).
export DESTINATION__POSTGRES__CREDENTIALS='<from .dlt/secrets.toml or the repo secret, if needed>'
```

**1. DBPR SIRS** — real failure mode is `page.goto` **timing out** (60s), not an HTTP status; the
Qlik websocket URL never gets captured (`ingest/pipelines/dbpr_sirs/qix.py`):
```bash
~/swfl-runner-venv/bin/python -m ingest.pipelines.dbpr_sirs.pipeline --dry-run
```
**PASS:** `[dbpr-sirs] dry-run: would upsert N rows` with `N > 0`, and two `[dbpr-sirs] QIX pull ...`
lines above it (`pre_july_2025` and `july_2025_plus`) with no `ERROR pulling` between them.
**FAIL:** `[dbpr-sirs] ERROR pulling <period>: ...` or `would upsert 0 rows`.

**2. Crexi** — `https://api-lease.crexi.com/assets/search` **only** answers from inside a
Cloudflare-cleared browser page (`ingest/pipelines/crexi_listings/extract.py` lines 10-13); curling
it directly always 403s "Just a moment…" even from a clean IP — don't test it that way, it's not a
useful signal:
```bash
~/swfl-runner-venv/bin/python -m ingest.pipelines.crexi_listings.pipeline --dry-run
```
**PASS:** exit 0, ends `Done. N raw listings, M rows would be upserted.` with `N > 0`.
**FAIL:** exit 1, `ERROR: 0 raw listings from all targets — browser scrape or LLM extraction failed
for every city` (the pipeline's own full-block message).

**3. Collier official records** — Kendo/Blazor grid, no CAPTCHA observed as of 08/12/2026 per its
own docstring (`ingest/pipelines/collier_official_records/scraper.py`). Test a multi-day window so
a legitimately quiet single day can't read as a false fail:
```bash
~/swfl-runner-venv/bin/python -m ingest.pipelines.collier_official_records.pipeline \
  --start "$(date -d '3 days ago' +%F)" --end "$(date -d 'yesterday' +%F)" --dry-run
```
**PASS:** `collier_official_records dry-run: N rows for <start>..<end>` with `N > 0`, plus a
`first row: {...}` line. **FAIL:** a raised `Crawl4aiError` (no result marker / page didn't advance
/ blocked).

**4. Collier permits** — per its own docstring, Akamai blocks by **TLS/JA3 fingerprint "from any
IP, datacenter and residential"** (`ingest/pipelines/collier_permits/fetcher.py` lines 6-9); the
`UndetectedAdapter` is what clears it, and that already works on `ubuntu-latest` today (see "what's
already true" above). This test confirms Fedora is at least as good, not fixing a live break:
```bash
~/swfl-runner-venv/bin/python -m ingest.pipelines.collier_permits.pipeline --dry-run
```
**PASS:** `XLSX size: N bytes` then `collier_permits dry-run: N rows from <filename> (geocode + dlt
skipped)`. **FAIL:** `ValueError: ... did not return a ZIP/xlsx ...` (Akamai served an HTML block
page instead of the file — the check already built into `fetcher.py`'s `download_month`).

### 3c. If §2e's podman fallback was needed, re-run all four through the container too

```bash
podman run --rm -v ~/swfl-test-checkout:/work:Z -w /work swfl-ingest:local \
  python -m ingest.pipelines.dbpr_sirs.pipeline --dry-run
# ...repeat for the other three...
```
The bare-venv network stack and the container's network stack aren't guaranteed identical — one
passing doesn't prove the other does.

**If any of the four fail 3b/3c: stop here.** Don't spend time finishing §1/§4 for a job that still
can't do its work from this IP; go back to Ricky with which one(s) failed and the exact error line.

---

## §4 — Register against this repo, scoped to ONLY these 4 workflows

### 4a. Reuse the label already wired in code: `swfl-local`

Both `dbpr-sirs-monthly.yml` and `ingest-crexi-listings.yml` already say
`runs-on: [self-hosted, swfl-local]`, and `wiki/pipeline-health.md`'s decision log already frames
this as "Fedora stands up as the `swfl-local` residential-IP runner ... then the Windows runner
retires." Don't invent a second label — that creates a second, unscoped routing surface.

**Sequencing landmine — read before running 4b:** the Windows box is still what answers to
`swfl-local` today; it's offline, not deregistered. A label can have more than one runner behind
it — GitHub picks whichever is idle/online — so if the Windows runner ever comes back online before
it's retired, a job can nondeterministically land on it, and its Windows-only env (`VENV_PY:
'C:\Users\ethan\sirs-runner-venv\Scripts\python.exe'`, `shell: pwsh`) breaks instantly on a job
written for Linux/bash. **Before running `config.sh`:** open
`https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/settings/actions/runners`, and either remove
the offline Windows `swfl-local` entry, or confirm with yourself it's staying offline for good. This
is a browser click, not a shell command — flagging it here so it doesn't get skipped.

### 4b. Finish `config.sh` (get a fresh token from the live page if >1hr passed since §1a)

```bash
cd ~/actions-runner
./config.sh \
  --url https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf \
  --token <TOKEN-FROM-THE-LIVE-UI-PAGE> \
  --name fedora-swfl-local \
  --labels swfl-local \
  --work _work \
  --unattended
```
Flag syntax (`--url`, `--token`, `--labels <comma-separated>`, `--name`, `--work`, `--unattended`)
confirmed live 2026-09-15 against `docs.github.com/.../using-labels-with-self-hosted-runners` — only
the token and download URL are per-session values; the flags themselves are stable.
**PASS:** ends `√ Connected to GitHub`, `√ Runner successfully added`, `√ Runner connection is good`.

### 4c. Start the systemd --user service from §1b (don't run `run.sh` in a foreground terminal —
it dies the moment the SSH session closes)

```bash
systemctl --user enable --now gha-runner.service
systemctl --user status gha-runner.service        # PASS: "active (running)"
journalctl --user -u gha-runner.service -n 20 --no-pager   # PASS: a line ending "Listening for Jobs"
```

### 4d. Confirm scope in the browser

`Settings → Actions → Runners` should show exactly one **online** runner, `fedora-swfl-local`,
labeled `swfl-local`. The other 109 workflows in this repo all say `runs-on: ubuntu-latest` and will
never route here — label-based `runs-on` targeting is exclusive by construction, nothing else to
configure for isolation.

---

## Follow-up — outside this ssh session (flagged, not done; this task's write scope is this one file)

- `.github/workflows/ingest-collier-official-records.yml` and
  `.github/workflows/collier-permits-monthly.yml` both still say `runs-on: ubuntu-latest` — they
  need that line changed to `runs-on: [self-hosted, swfl-local]` before those two jobs actually
  reach Fedora. This runbook stands the runner up; it doesn't repoint the workflows. Separate PR,
  separate session — and per the note in "what's already true," worth re-confirming Collier permits
  even needs this before spending the diff.
- Once Fedora is proven and those two YAML edits land, remove the Windows runner's registration for
  real (`Settings → Actions → Runners → fedora-... ` — er, the Windows entry) so the shared
  `swfl-local` label can't nondeterministically pick a dead Windows box again.
- The repo is public (confirmed). `Settings → Actions → General → Fork pull request workflows
  approval` is worth a glance before this runner goes live — a self-hosted runner on a public repo
  can, on a permissive default, execute an unreviewed outside PR's workflow code on Ricky's own
  machine. One click to check, flagging so it isn't missed — not part of this checklist's job to
  change.
