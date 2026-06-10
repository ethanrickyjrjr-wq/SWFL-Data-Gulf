# Task 02 — `/api/projects` CRUD (cookie client, RLS-enforced)

**Critical rule:** these routes use the **cookie client** (`createClient(cookieStore)` from `utils/supabase/server.ts`), NOT the service-role client. RLS is the authorization — using service-role here would bypass ownership and leak across users.

**Files:** Create `app/api/projects/route.ts` (POST create) + `app/api/projects/[id]/route.ts` (GET/PATCH/DELETE). Test: route tests for each.

- [ ] **Step 1: Failing tests** — unauthenticated POST → 401; PATCH with an invalid `items` payload → 422 (zod); GET someone else's project → 404/empty (RLS).

- [ ] **Step 2: POST /api/projects** — require a session (`supabase.auth.getUser()`); insert `{ id: crypto.randomUUID().slice(0,12), user_id: user.id, title, items: validated }`; meter `project_create`; return `{id}`.

- [ ] **Step 3: GET/PATCH/DELETE /api/projects/[id]** — all via the cookie client so RLS scopes to the owner. PATCH validates `items` with `projectItemsSchema` (`lib/project/items.ts`) → 422 on failure; bumps `updated_at`. DELETE removes the row.

```ts
import { projectItemsSchema } from "@/lib/project/items";
// PATCH body.items -> projectItemsSchema.safeParse(...); if !success return 422
```

- [ ] **Step 4: Never service-role.** Grep your two new files for `service-role`/`createServiceRoleClient` → must be ZERO matches. (Self-check; this is the leak vector.)

- [ ] **Step 5: Tests green; commit.** `git add app/api/projects/route.ts "app/api/projects/[id]/route.ts" && git commit -m "feat(projects): cookie-scoped CRUD (RLS-enforced), zod-validated items"`
