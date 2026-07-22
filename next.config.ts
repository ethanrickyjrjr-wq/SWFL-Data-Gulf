import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // @resvg/resvg-js is a native (napi) addon; Turbopack cannot place its .node
  // binary in an ESM chunk. Opt it out of bundling so the App Route /api/social/
  // render/[format] requires it natively at runtime (the documented fix for
  // native node addons). Build 02 — social image rasterizer.
  // @resvg/resvg-js is a native (napi) addon (social rasterizer). @react-pdf/renderer
  // (yoga-layout/fontkit) and pdf-parse (bundles a pdfjs build for Node text
  // extraction) must also run natively rather than be bundled by Turbopack —
  // opting them out is the documented fix for the PDF root (lib/pdf/*).
  serverExternalPackages: ["@resvg/resvg-js", "@react-pdf/renderer", "pdf-parse"],
  outputFileTracingIncludes: {
    // NOTE: the /api/mcp chart-widget bundle is intentionally NOT shipped — the
    // tool is text-only (see app/api/mcp/server.ts; MCP App widget blocked by the
    // open host bug claude-ai-mcp#61/#165). Restore the line shipping
    // "./docs/fiverr-briefs/assets/Chat-Charts-Standalone.html" when re-enabling.
    "/data-intel": ["./docs/data-intel.md"],
    // The render route reads template shells from disk at runtime — bundle them
    // into the serverless function (otherwise renderHtmlTemplate 500s in prod).
    "/api/templates/render": ["./templates/html/**/*.html"],
    // The data-readiness cron reads the per-metric tolerances yaml from disk at
    // runtime — bundle it so loadTolerances finds the real config rather than
    // falling back to built-in defaults (the read is via process.cwd()).
    "/api/cron/data-readiness": ["./ingest/data-verification-tolerances.yaml"],
    // svgToPng (lib/charts/chart-fonts) loads a bundled Liberation TTF by path at
    // runtime — Vercel's Linux runtime has no system Arial, so without these the
    // chart route renders blank-text PNGs (silently). The Email Lab AI build is the
    // ONLY route that rasterizes a chart; any NEW svgToPng caller-route must add
    // this. (The /api/email-lab/ai entry lives below, merged with its sharp files.)
    // The social rasterizer now loads the same bundled Liberation TTFs by path at
    // runtime (lib/brand/fonts CANVAS_FONT_FILES) — same blank-text landmine as
    // the chart route above.
    "/api/social/render/[format]": ["./assets/fonts/*.ttf"],
    // sharp (Next's default external) dlopens libvips-cpp.so from
    // @img/sharp-libvips-linux-x64 — an RPATH link, invisible to the file
    // tracer, so prod threw ERR_DLOPEN_FAILED (07/03/2026: killed This Week +
    // lab AI). Force both linux-x64 packages into every route that can run a
    // sharp derivative (listing-photo crop / media upload). Any NEW sharp
    // caller-route must add itself here.
    "/api/email-lab/ai": [
      "./assets/fonts/*.ttf",
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/api/email-lab/media": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/api/email-lab/social-calendar": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/api/email-lab/social/generate": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/api/projects/[id]/week": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    // ZIP cutout PNG (seeded ZIP email's image block): reads the contractor SVG
    // from disk at runtime — belt-and-braces trace so the file always ships.
    "/api/zip-shape/[zip]": ["./public/map/lee-collier.svg"],
    // /c/[id]/card rasterizes the saved-chart social card via svgToPng — bundle
    // the chart TTFs or Vercel renders every label blank (see
    // lib/charts/chart-fonts.ts header for the landmine).
    "/c/[id]/card": ["./assets/fonts/*.ttf"],
  },
  async redirects() {
    return [
      {
        source: "/connect",
        destination: "/",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

// Sentry (Layer 12 — error tracking). withSentryConfig wraps the Next config to
// register the SDK across all three runtimes and (only when SENTRY_AUTH_TOKEN is
// set in CI) upload source maps. With no auth token the upload step is skipped and
// the build still succeeds — nothing here requires network access at build time.
export default withSentryConfig(nextConfig, {
  // Project coordinates for source-map upload. Read from env so this file carries
  // no org/project literals; unset → upload simply no-ops.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Auth token stays in CI/Vercel env, never in version control. Absent → no upload.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only print SDK build logs in CI.
  silent: !process.env.CI,
  // Upload a wider set of client bundles for readable stack traces (only runs
  // when an auth token is present).
  widenClientFileUpload: true,
});
