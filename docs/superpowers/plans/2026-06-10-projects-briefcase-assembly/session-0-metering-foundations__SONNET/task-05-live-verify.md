# Task 05 — Live verify + close `cookie_mint_live_verify`

**Why:** `cookie_mint_live_verify` is a **prod-evidence** check (`feedback_checks-prod-evidence-not-dev-attestation`). It closes only on a runtime signal from the deployed site — not "code looks right."

- [ ] **Step 1: Ship** (push per `../shared/conventions.md` checklist — SESSION_LOG entry + safe-push, pausing for operator push confirmation). Ensure `SDG_COOKIE_SECRET` is set in Vercel Production **before** relying on the verify.

- [ ] **Step 2: Cookie minted on first visit.** From a clean client:

```bash
curl -sI https://www.swfldatagulf.com/r/master | grep -i set-cookie
```

Expected: `set-cookie: sdg_cid=<uuid>.<16hex>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`.

- [ ] **Step 3: Cookie reused on second visit** (send it back, expect NO new Set-Cookie):

```bash
curl -sI -H "cookie: sdg_cid=<value-from-step-2>" https://www.swfldatagulf.com/r/master | grep -i set-cookie || echo "no new cookie (correct)"
```

- [ ] **Step 4: `usage_events.client_id` is no longer always `anon`.** Trigger an ask on `/r/master` carrying the cookie, then:

```bash
python -c "import psycopg, ...; print(conn.execute(\"select client_id, action, count(*) from public.usage_events where created_at > now() - interval '10 min' group by 1,2\").fetchall())"
```

Expected: at least one row with a real `<uuid>` client_id (not `anon`).

- [ ] **Step 5: Forged cookie → `anon`.** Send a bad signature and confirm the recorded `client_id` is `anon` (verify rejects it):

```bash
curl -s -H "cookie: sdg_cid=forged-id.0000000000000000" -X POST https://www.swfldatagulf.com/api/meter \
  -H 'content-type: application/json' -d '{"action":"item_add","report_id":"master"}'
# then query usage_events for the just-inserted row → client_id should be 'anon'
```

- [ ] **Step 6: Close the check** with the evidence:

```bash
node scripts/check.mjs close cookie_mint_live_verify "prod: sdg_cid minted+reused on /r/master; real uuid client_id in usage_events; forged sig -> anon"
```
