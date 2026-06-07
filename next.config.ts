import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // NOTE: the /api/mcp chart-widget bundle is intentionally NOT shipped — the
    // tool is text-only (see app/api/mcp/server.ts; MCP App widget blocked by the
    // open host bug claude-ai-mcp#61/#165). Restore the line shipping
    // "./docs/fiverr-briefs/assets/Chat-Charts-Standalone.html" when re-enabling.
    "/data-intel": ["./docs/data-intel.md"],
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

export default nextConfig;
