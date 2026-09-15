/**
 * MCP anonymous usage gate — a monthly free-tier cap for keyless callers.
 *
 * swfl_fetch / swfl_reconcile take no key (v1 connect-once design). Any
 * caller presenting X-Account-Key or X-Project-Key (the two auth paths
 * server.ts / account-resolve.ts already read) is uncapped — connecting an
 * account is the escape from this cap, not a separate paywall. Only requests
 * with NEITHER header are metered, keyed on a hashed IP (lib/mcp/anon-usage.ts).
 *
 * Same shape as unauthorizedResponse (auth.ts) deliberately: a Response the
 * caller MUST return when non-null, null when the request may proceed. Runs
 * AFTER the auth gate in route.ts. NEVER THROWS — checkMcpUsageAllowance and
 * recordMcpUsage both fail open, so a metering outage can only under-cap,
 * never take the MCP surface down.
 */

import { clientIpFromHeaders } from "@/lib/rate-limit";
import {
  FREE_ANON_MCP_REQUESTS_PER_MONTH,
  checkMcpUsageAllowance,
  hashIp,
  recordMcpUsage,
} from "@/lib/mcp/anon-usage";

const DENY_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Cache-Control": "no-store",
};

function hasAccountOrProjectKey(headers: Headers): boolean {
  return Boolean(headers.get("x-account-key")?.trim() || headers.get("x-project-key")?.trim());
}

/**
 * @returns a 429 `Response` when a keyless caller has exceeded this month's
 *          free request cap — the caller returns it verbatim — or `null`
 *          when the request may proceed (including every keyed/authenticated
 *          caller).
 */
export async function usageLimitedResponse(request: Request): Promise<Response | null> {
  // Keyed callers (an account, or a project capability key) are never capped
  // here — connecting is the intended escape from this limit.
  if (hasAccountOrProjectKey(request.headers)) return null;

  const ip = clientIpFromHeaders(request.headers);
  const ipHash = hashIp(ip);

  const { allowed } = await checkMcpUsageAllowance(ipHash);
  if (!allowed) {
    return new Response(
      `Monthly free limit reached (${FREE_ANON_MCP_REQUESTS_PER_MONTH} keyless requests/month). ` +
        `Connect an account at https://www.swfldatagulf.com/connect for unlimited access, or wait for next month.`,
      { status: 429, headers: DENY_HEADERS },
    );
  }

  // Fire-and-forget is fine — recordMcpUsage never throws/rejects.
  void recordMcpUsage(ipHash);
  return null;
}
