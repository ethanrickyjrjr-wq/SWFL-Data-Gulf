import type { MetadataRoute } from "next";

const ORIGIN = "https://www.swfldatagulf.com";

/**
 * robots.txt — moat policy.
 *
 * GOAL: stay fully visible to traditional search (Google, Bing, Apple/Siri) and
 * social link-previews, while keeping our synthesized brain reports out of AI
 * *training corpora* and *answer-engine indexes* — the zero-click bulk harvest
 * that is the actual threat to a data moat.
 *
 * Every token below was verified against the vendor's LIVE crawler docs on
 * 2026-06-06 (Anthropic, OpenAI, Google, Apple, Meta, Perplexity, Amazon,
 * Cohere, Common Crawl, Webz.io, Diffbot, Hive). robots.txt user-agent matching
 * is case-INsensitive per RFC 9309, but we use each vendor's documented casing
 * verbatim so the file reads as authoritative.
 *
 * WHAT robots.txt CAN AND CANNOT DO — read before trusting it as protection:
 *  1. It is ADVISORY. Compliant crawlers obey. Bytespider, Perplexity-User,
 *     Meta-ExternalFetcher and GrokBot are documented/reported to IGNORE it —
 *     a hard block for those needs a WAF/edge rule (Vercel/Cloudflare), not
 *     this file. The ones marked "ignores robots" below are listed for intent
 *     signaling; do not rely on the line to stop them.
 *  2. It does NOT protect /api/b/*. That route serves the entire lake as open
 *     JSON (Access-Control-Allow-Origin: *, no auth, no rate-limit) — anyone
 *     can curl it regardless of this file. If data exfiltration actually
 *     matters, the lever is throttling/token-gating that endpoint, not robots.
 *  3. It only stops FUTURE crawls. Anything already in a corpus (e.g. prior
 *     Common Crawl snapshots) stays there.
 *
 * DELIBERATELY NOT BLOCKED — live user-fetch agents (ChatGPT-User, Claude-User,
 * Perplexity-User, Meta-ExternalFetcher, Amzn-User, MistralAI-User, Diffbot-User,
 * OAI-AdsBot). These fire only when a real user pastes our URL into an assistant
 * — a citation/discovery channel, not bulk harvest — and several ignore robots
 * anyway. To switch to a strict-lockdown posture, move them into AI_ANSWER_ENGINES.
 */

// ── AI TRAINING crawlers — ingest content to train/improve models. ──────────
// Blocking these costs ZERO search visibility (none power Google/Bing/Apple).
const AI_TRAINING = [
  "GPTBot", // OpenAI training
  "ClaudeBot", // Anthropic training — PRIMARY (supersedes anthropic-ai / Claude-Web)
  "anthropic-ai", // Anthropic legacy token, kept for old-crawler backward-compat
  "Google-Extended", // Google Gemini/Vertex training opt-out (does NOT affect Googlebot/Search)
  "Google-CloudVertexBot", // Google Vertex AI agent grounding fetch
  "Applebot-Extended", // Apple Intelligence training opt-out (does NOT affect Applebot/Siri search)
  "meta-externalagent", // Meta foundation-model training (supersedes FacebookBot training role)
  "CCBot", // Common Crawl — upstream corpus for nearly every LLM (highest leverage)
  "Amazonbot", // Amazon AI training
  "bedrockbot", // Amazon Bedrock RAG/agent grounding (community-attested)
  "Bytespider", // ByteDance/TikTok training — IGNORES robots.txt (needs WAF for a real block)
  "TikTokSpider", // ByteDance sibling/successor (community-attested)
  "cohere-ai", // Cohere (legacy/undocumented agent)
  "cohere-training-data-crawler", // Cohere dedicated training crawler — the load-bearing Cohere block
  "Diffbot", // Diffbot Knowledge Graph — sold for AI-training / market-intel
  "Omgilibot", // Webz.io legacy training-data feed
  "Webzio-Extended", // Webz.io current AI/ML training data feed (supersedes Omgilibot)
  "ImagesiftBot", // Hive — image+text scrape for training / web-intel
  "AI2Bot", // Allen Institute for AI training (community-attested)
  "Ai2Bot-Dolma", // AI2 open-dataset (Dolma) training crawler (community-attested)
  "Timpibot", // Timpi decentralized-index training (community-attested)
  "GrokBot", // xAI/Grok training — reported to spoof UAs / ignore robots (needs WAF)
];

// ── AI ANSWER-ENGINE / RAG indexers — bulk-index our synthesis to answer ─────
// users inside their product (zero-click, often no attribution traffic).
// NOT traditional search: blocking does NOT remove us from Google/Bing/Apple.
const AI_ANSWER_ENGINES = [
  "OAI-SearchBot", // OpenAI ChatGPT Search index
  "Claude-SearchBot", // Anthropic Claude answer-engine index
  "PerplexityBot", // Perplexity answer engine
  "meta-webindexer", // Meta AI search index
  "Amzn-SearchBot", // Amazon Rufus / Alexa answer surfaces
  "YouBot", // You.com answer engine
  "DuckAssistBot", // DuckDuckGo AI answers (DDG's normal search via Bing is unaffected)
  "Google-NotebookLM", // Google NotebookLM source ingestion
];

const BLOCKED = [...AI_TRAINING, ...AI_ANSWER_ENGINES];

/**
 * Next.js robots.txt. An array `userAgent` emits one `User-Agent: X / Disallow: /`
 * block per token (verified against Next.js v16 robots metadata docs).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Everyone else — incl. Googlebot, Bingbot, Applebot, facebookexternalhit,
      // and all live user-fetch agents — is welcome; only the API tree is off-limits
      // (raw JSON should never be indexed as pages).
      { userAgent: "*", allow: "/", disallow: "/api/" },
      // AI training + answer-engine crawlers: full block.
      { userAgent: BLOCKED, disallow: "/" },
    ],
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
