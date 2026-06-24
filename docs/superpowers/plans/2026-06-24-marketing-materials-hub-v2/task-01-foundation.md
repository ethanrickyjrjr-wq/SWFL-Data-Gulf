### Task 1: Foundation — DB migration, types, TemplateId, page.tsx wiring

**Model:** Opus · **Depends on:** nothing (do first) · **Touches `page.tsx` — conflicts with Task 9, never run in parallel.**

**Files:**
- Create: `docs/sql/20260624_materials_hub.sql`
- Modify: `lib/deliverable/templates.ts` (`TemplateId` union + `buildRenderModel` switch ~378-438)
- Modify: `app/project/[id]/workspace/types.ts` (`DeliverableRow` ~28-52)
- Modify: `app/project/[id]/page.tsx` (deliverables SELECT ~136-145 + `.map()` projection ~147-160)

**Interfaces:**
- Produces: `deliverables.doc JSONB`, `deliverables.data_as_of TIMESTAMPTZ`; public `email-media` bucket; `"block-canvas"` in `TemplateId`; `DeliverableRow.doc: EmailDoc | null` + `DeliverableRow.data_as_of: string | null`; `doc`/`data_as_of` populated on every `DeliverableRow` reaching the client.

---

- [ ] **Step 1: Write the migration**

```sql
-- docs/sql/20260624_materials_hub.sql
-- Materials Hub v2: block-canvas emails stored as deliverables + a public bucket for email images.

-- 1. Block-canvas columns (idempotent). block-canvas rows populate `doc`; all others leave it null.
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS doc JSONB;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS data_as_of TIMESTAMPTZ;

-- 2. Public bucket for durable email image URLs (mirrors docs/sql/20260620_social_media_bucket.sql).
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-media', 'email-media', true)
ON CONFLICT (id) DO NOTHING;
```

Open `docs/sql/20260620_social_media_bucket.sql` and copy any extra statements it uses (e.g. a public-read policy on `storage.objects`) verbatim for `email-media`, swapping the bucket id. Do not invent policy SQL — mirror the proven file.

- [ ] **Step 2: Run the migration** (creds in `.dlt/secrets.toml`)

Run: `psql "$DATABASE_URL" < docs/sql/20260624_materials_hub.sql`
Expected: `ALTER TABLE` ×2, `INSERT 0 1` (or `0 0` if the bucket already exists).

- [ ] **Step 3: Verify columns + bucket**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='deliverables' AND column_name IN ('doc','data_as_of');   -- expect 2 rows
SELECT id, public FROM storage.buckets WHERE id='email-media';             -- expect email-media | t
```

- [ ] **Step 4: Add `"block-canvas"` to `TemplateId`**

In `lib/deliverable/templates.ts`, add the member to the union (~line 90-96):

```typescript
export type TemplateId =
  | "market-overview" | "bov-lite" | "client-email"
  | "one-pager" | "email" | "social"
  | "block-canvas";
```

- [ ] **Step 5: Add the matching `buildRenderModel` case (REQUIRED — or the build breaks)**

`buildRenderModel` ends with an exhaustive `const _exhaustive: never = template` (~line 435). Adding the union member without a `case` makes `template` no longer assignable to `never`. Find the `case "email":` (~426-433) — it `throw`s because email renders elsewhere. Add a sibling that throws identically (block-canvas renders via `EmailDocEmail`, never here):

```typescript
    case "block-canvas":
      throw new Error("block-canvas renders via EmailDocEmail, not buildRenderModel");
```

- [ ] **Step 6: Extend `DeliverableRow`**

In `app/project/[id]/workspace/types.ts`, add to `DeliverableRow` (after `versions?`, ~line 51):

```typescript
  /** Block-canvas email document (null for report templates). */
  doc: import("@/lib/email/doc/types").EmailDoc | null;
  /** When the data in this material was last refreshed; drives "needs update". */
  data_as_of: string | null;
```

- [ ] **Step 7: Add the columns to the page SELECT *and* the `.map()` projection**

In `app/project/[id]/page.tsx`: the deliverables `.select(...)` (~136-145) is an explicit column list — add `doc, data_as_of`. Then the `.map()` that builds each `DeliverableRow` (~147-160) sets fields one by one and currently copies neither — add them:

```typescript
    doc: d.doc ?? null,
    data_as_of: d.data_as_of ?? null,
```

(Without the `.map()` edit the columns never reach the client even after the SELECT change.)

- [ ] **Step 8: Verify build**

Run: `bunx next build`
Expected: clean (no `never`-assignment error, no type errors on `DeliverableRow`).

- [ ] **Step 9: Commit**

```bash
git add docs/sql/20260624_materials_hub.sql lib/deliverable/templates.ts "app/project/[id]/workspace/types.ts" "app/project/[id]/page.tsx"
git commit -m "feat(materials-hub): doc+data_as_of columns, email-media bucket, block-canvas TemplateId"
```
