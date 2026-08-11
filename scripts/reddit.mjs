#!/usr/bin/env node
/**
 * reddit.mjs — fetch Reddit threads or subreddit listings via the Reddit OAuth API
 *
 * Requires a free Reddit app (script type):
 *   1. Go to https://www.reddit.com/prefs/apps → "create another app" → type: script
 *   2. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in your env or .env.local
 *   3. Set REDDIT_USERNAME and REDDIT_PASSWORD (the account that owns the app)
 *
 * Usage:
 *   node scripts/reddit.mjs <url-or-path>  [--limit N] [--sort hot|new|top] [--out file.json]
 *
 * Examples:
 *   node scripts/reddit.mjs r/ClaudeAI
 *   node scripts/reddit.mjs r/ClaudeCode --sort top --limit 25
 *   node scripts/reddit.mjs https://www.reddit.com/r/ClaudeAI/comments/1sapnyb/these_10_github_repos/
 *   node scripts/reddit.mjs r/ClaudeAI --out .firecrawl/reddit-claudeai.json
 */

import { writeFileSync, readFileSync, existsSync } from "fs";

// Load .env.local if present
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env;

const APP_UA = `brain-platform/1.0 by ${REDDIT_USERNAME ?? "unknown"}`;

async function getToken() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD) {
    console.error(`
Missing Reddit credentials. Set these in .env.local or your environment:
  REDDIT_CLIENT_ID      — from https://www.reddit.com/prefs/apps
  REDDIT_CLIENT_SECRET  — from the same app
  REDDIT_USERNAME       — your Reddit username
  REDDIT_PASSWORD       — your Reddit password
`);
    process.exit(1);
  }

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "User-Agent": APP_UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "password",
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    }),
  });

  if (!res.ok) {
    console.error(`Auth failed: HTTP ${res.status}`, await res.text());
    process.exit(1);
  }

  const { access_token } = await res.json();
  return access_token;
}

function parseArgs(argv) {
  const args = { limit: 25, sort: null, out: null, target: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") args.limit = parseInt(argv[++i]);
    else if (argv[i] === "--sort") args.sort = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (!args.target) args.target = argv[i];
  }
  return args;
}

function buildPath(target, { limit, sort }) {
  let path = target.replace(/^https?:\/\/(www\.)?reddit\.com/, "").replace(/\/$/, "");
  if (!path.startsWith("/")) path = "/" + path;

  const isThread = path.includes("/comments/");
  const params = new URLSearchParams();
  if (!isThread) params.set("limit", limit);
  if (sort && !isThread) params.set("sort", sort);
  const qs = params.toString();
  return {
    path,
    isThread,
    url: `https://oauth.reddit.com${path}.json${qs ? "?" + qs : ""}`,
  };
}

function formatListing(data) {
  return data.data.children.map((c) => {
    const p = c.data;
    return {
      title: p.title,
      author: p.author,
      score: p.score,
      num_comments: p.num_comments,
      url: `https://www.reddit.com${p.permalink}`,
      flair: p.link_flair_text ?? null,
      created_utc: new Date(p.created_utc * 1000).toISOString(),
      selftext_preview: p.selftext?.slice(0, 300) || null,
    };
  });
}

function flattenComments(children, depth = 0) {
  const out = [];
  for (const child of children) {
    if (child.kind !== "t1") continue;
    const c = child.data;
    out.push({
      depth,
      author: c.author,
      score: c.score,
      body: c.body?.slice(0, 500) ?? "",
      created_utc: new Date(c.created_utc * 1000).toISOString(),
    });
    if (c.replies?.data?.children?.length) {
      out.push(...flattenComments(c.replies.data.children, depth + 1));
    }
  }
  return out;
}

function formatThread(data) {
  const [postData, commentsData] = data;
  const post = postData.data.children[0].data;
  return {
    post: {
      title: post.title,
      author: post.author,
      score: post.score,
      url: `https://www.reddit.com${post.permalink}`,
      selftext: post.selftext,
      created_utc: new Date(post.created_utc * 1000).toISOString(),
    },
    comments: flattenComments(commentsData.data.children),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error(
      "Usage: node scripts/reddit.mjs <url-or-subreddit> [--limit N] [--sort hot|new|top] [--out file.json]",
    );
    process.exit(1);
  }

  const token = await getToken();
  const { url, isThread } = buildPath(args.target, args);

  process.stderr.write(`→ GET ${url}\n`);

  const res = await fetch(url, {
    headers: {
      Authorization: `bearer ${token}`,
      "User-Agent": APP_UA,
    },
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}`, await res.text());
    process.exit(1);
  }

  const raw = await res.json();
  const result = isThread ? formatThread(raw) : formatListing(raw);
  const json = JSON.stringify(result, null, 2);

  if (args.out) {
    writeFileSync(args.out, json);
    process.stderr.write(`✓ saved to ${args.out}\n`);
    if (isThread) {
      console.log(`Thread: ${result.post.title}`);
      console.log(`Score: ${result.post.score} | Comments: ${result.comments.length}`);
    } else {
      console.log(`${result.length} posts`);
      result.slice(0, 5).forEach((p) => console.log(`  [${p.score}] ${p.title}`));
    }
  } else {
    process.stdout.write(json + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
