#!/usr/bin/env node
// seo-report.mjs — quick real-data SEO snapshot: Search Console (last 28 days,
// ending 3 days ago since GSC data lags) + PageSpeed Insights on the homepage.
//
//   bun run scripts/seo-report.mjs
//
// Read-only. No writes to any table — just prints a report.

const SITE = "sc-domain:swfldatagulf.com";
const HOMEPAGE = "https://www.swfldatagulf.com";

const { GSC_OAUTH_CLIENT_ID, GSC_OAUTH_CLIENT_SECRET, GSC_REFRESH_TOKEN, PAGESPEED_API_KEY } =
  process.env;

if (!GSC_OAUTH_CLIENT_ID || !GSC_OAUTH_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
  console.error(
    "Missing GSC_OAUTH_CLIENT_ID / GSC_OAUTH_CLIENT_SECRET / GSC_REFRESH_TOKEN in .env.local",
  );
  process.exit(1);
}
if (!PAGESPEED_API_KEY) {
  console.error("Missing PAGESPEED_API_KEY in .env.local");
  process.exit(1);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function getAccessToken() {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GSC_OAUTH_CLIENT_ID,
      client_secret: GSC_OAUTH_CLIENT_SECRET,
      refresh_token: GSC_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function gscQuery(accessToken, body) {
  const resp = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Search Console query failed: ${JSON.stringify(json)}`);
  return json;
}

async function pageSpeed(strategy) {
  const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  url.searchParams.set("url", HOMEPAGE);
  url.searchParams.set("key", PAGESPEED_API_KEY);
  url.searchParams.set("strategy", strategy);
  url.searchParams.append("category", "performance");
  url.searchParams.append("category", "seo");
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok) throw new Error(`PageSpeed (${strategy}) failed: ${JSON.stringify(json)}`);
  return json;
}

const today = new Date();
const endDate = new Date(today);
endDate.setDate(endDate.getDate() - 3); // GSC data lags ~2-3 days
const startDate = new Date(endDate);
startDate.setDate(startDate.getDate() - 27); // 28-day window

console.log(`SEO snapshot — SWFL Data Gulf`);
const [y, m, d] = ymd(today).split("-");
console.log(`As of ${m}/${d}/${y} (MM/DD/YYYY)\n`);

const accessToken = await getAccessToken();

const totals = await gscQuery(accessToken, {
  startDate: ymd(startDate),
  endDate: ymd(endDate),
  dimensions: [],
});
const t = totals.rows?.[0];

console.log(`Search Console — ${ymd(startDate)} to ${ymd(endDate)} (28 days):`);
if (t) {
  console.log(`  Clicks: ${t.clicks}`);
  console.log(`  Impressions: ${t.impressions}`);
  console.log(`  Average CTR: ${(t.ctr * 100).toFixed(2)}%`);
  console.log(`  Average position: ${t.position.toFixed(1)}`);
} else {
  console.log(
    "  No data returned for this window (site may be too new for Search Console data yet).",
  );
}

const topQueries = await gscQuery(accessToken, {
  startDate: ymd(startDate),
  endDate: ymd(endDate),
  dimensions: ["query"],
  rowLimit: 10,
});

console.log(`\nTop 10 queries by clicks:`);
if (topQueries.rows?.length) {
  for (const row of topQueries.rows) {
    console.log(
      `  "${row.keys[0]}" — ${row.clicks} clicks, ${row.impressions} impressions, pos ${row.position.toFixed(1)}`,
    );
  }
} else {
  console.log("  None yet.");
}

console.log(`\nPageSpeed Insights — ${HOMEPAGE}:`);
for (const strategy of ["mobile", "desktop"]) {
  const psi = await pageSpeed(strategy);
  const lh = psi.lighthouseResult;
  const perfScore = Math.round((lh.categories.performance?.score ?? 0) * 100);
  const seoScore = Math.round((lh.categories.seo?.score ?? 0) * 100);
  const lcp = lh.audits["largest-contentful-paint"]?.displayValue;
  const cls = lh.audits["cumulative-layout-shift"]?.displayValue;
  const inp =
    lh.audits["interaction-to-next-paint"]?.displayValue ??
    lh.audits["total-blocking-time"]?.displayValue;
  console.log(
    `  ${strategy}: performance ${perfScore}/100, SEO ${seoScore}/100 — LCP ${lcp}, CLS ${cls}, INP/TBT ${inp}`,
  );
}
