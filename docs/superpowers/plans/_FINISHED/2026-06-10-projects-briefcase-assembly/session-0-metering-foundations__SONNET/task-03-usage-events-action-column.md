# Task 03 — `usage_events.action` column (idempotent SQL)

**Context:** `docs/sql/20260607_usage_events.sql` created `usage_events(id, client_id, iso_week, report_id, reach, ip_hash, created_at)` (verified). Add an `action` dimension so every metered action type is distinguishable. Run the migration yourself (creds in `.dlt/secrets.toml`).

**Files:**
- Create: `docs/sql/20260611_usage_events_action.sql`

- [ ] **Step 1: Write the migration:**

```sql
-- 20260611_usage_events_action.sql — add action dimension to usage_events. Idempotent.
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'ask';

CREATE INDEX IF NOT EXISTS usage_events_action_week_idx
  ON public.usage_events (client_id, iso_week, action);
```

- [ ] **Step 2: Apply it** (idempotent — safe to re-run):

```bash
python -c "import psycopg, tomllib, pathlib; s=tomllib.loads(pathlib.Path('.dlt/secrets.toml').read_text()); \
import re; \
conn=psycopg.connect('postgresql://postgres:%s@%s:5432/postgres' % (s['<password-key>'], s['<host-key>'])); \
conn.execute(open('docs/sql/20260611_usage_events_action.sql').read()); conn.commit(); print('applied')"
```

(Fill `<password-key>`/`<host-key>` from the real `.dlt/secrets.toml` structure — grep it; per `feedback_fill-in-commands-dont-template`, hand yourself a runnable command, don't leave the placeholder.)

- [ ] **Step 3: Verify the column exists:**

```bash
python -c "import psycopg, ...; cur=conn.execute(\"select column_name,data_type,column_default from information_schema.columns where table_schema='public' and table_name='usage_events' and column_name='action'\"); print(cur.fetchall())"
```

Expected: `[('action', 'text', \"'ask'::text\")]`.

- [ ] **Step 4: Commit.**

```bash
git add docs/sql/20260611_usage_events_action.sql
git commit -m "feat(meter): usage_events.action column + index (idempotent)"
```
