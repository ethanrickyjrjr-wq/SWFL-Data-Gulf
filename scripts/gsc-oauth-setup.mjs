#!/usr/bin/env node
// gsc-oauth-setup.mjs — one-time interactive OAuth flow for the Search Console API.
//
// The GCP org policy `iam.disableServiceAccountKeyCreation` blocks service-account
// JSON keys on this project, so GSC access goes through a Desktop-app OAuth client
// instead (authenticates as the operator's own Google account, not a robot account —
// not subject to that policy at all). Run this ONCE:
//
//   bun run scripts/gsc-oauth-setup.mjs
//
// It opens a login/consent URL, you approve in the browser, and it prints the
// refresh token to store as GSC_REFRESH_TOKEN. After that, no browser is needed
// again — the refresh token exchanges for new access tokens indefinitely.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local");

const CLIENT_ID = process.env.GSC_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GSC_OAUTH_CLIENT_ID / GSC_OAUTH_CLIENT_SECRET in .env.local");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log(
  "\nOpen this URL, log in with the Google account that owns swfldatagulf.com in Search Console, and click Allow:\n",
);
console.log(authUrl.toString());
console.log(`\nWaiting for the redirect on ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.end(`Auth failed: ${error}. Check the terminal and try again.`);
    console.error(`Auth failed: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.end("Waiting for authorization...");
    return;
  }

  res.end("Authorized — you can close this tab and go back to the terminal.");
  server.close();

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });

  const tokens = await tokenResp.json();
  if (!tokenResp.ok) {
    console.error("Token exchange failed:", tokens);
    process.exit(1);
  }
  if (!tokens.refresh_token) {
    console.error(
      "No refresh_token in response — Google only issues one on first consent. " +
        "Revoke this app's access at https://myaccount.google.com/permissions and re-run this script.",
    );
    process.exit(1);
  }

  // Write the secret straight to .env.local — never print it to the terminal.
  const envText = fs.readFileSync(ENV_PATH, "utf8");
  const line = `GSC_REFRESH_TOKEN=${tokens.refresh_token}`;
  const updated = /^GSC_REFRESH_TOKEN=.*$/m.test(envText)
    ? envText.replace(/^GSC_REFRESH_TOKEN=.*$/m, line)
    : envText.trimEnd() + "\n" + line + "\n";
  fs.writeFileSync(ENV_PATH, updated);
  console.log("\nSaved GSC_REFRESH_TOKEN to .env.local (value not printed here).");

  // Prove it actually works — real call, not a guess. Only print site URLs (not secret).
  const sitesResp = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const sites = await sitesResp.json();
  const urls = (sites.siteEntry || []).map((s) => `${s.siteUrl} (${s.permissionLevel})`);
  console.log("\nVerified Search Console properties this account can read:");
  console.log(urls.length ? urls.join("\n") : JSON.stringify(sites));

  process.exit(0);
});

server.listen(PORT);
