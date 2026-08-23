# Migration & RLS Audit Report

Date: 2026-04-21
Scope: Read-only audit of live Postgres policies in the `public` schema versus the 60+ migration files in `supabase/migrations/`.

## Summary

- **RLS coverage**: All 63 tables in `public` have RLS enabled. No table is unprotected.
- **Duplicate-named migrations**: `20260330101240_add_pos_order_type_to_rls_policy.sql` and `20260330102136_add_pos_order_type_to_rls_policy.sql` share a filename slug but contain **different** changes (one edits the RLS policy, the other edits `CHECK` constraints). No content duplication, but naming is misleading — rename recommended, but **do not** retroactively edit applied migrations; leave as-is.
- **Critical policy issues**: Several tables have policies with `USING (true)` or `WITH CHECK (true)` for authenticated or anonymous users. These defeat the purpose of RLS.

## Critical findings (need remediation)

### 1. Orders & order items leak to anyone
- `orders` policy `"Anyone can view orders"` — `SELECT`, roles `{anon,authenticated}`, `USING (true)`.
- `order_items` policy `"Anyone can view order items"` — same shape.
- **Impact**: Any visitor with the anon key can read every order, including customer names, phone numbers, totals, statuses. Orders already have a narrower `"Customers can view own orders"` policy, so the permissive one is redundant and unsafe.

### 2. Payment transactions readable & updatable by anon
- `payment_transactions` policy `"Anyone can view transactions by ID"` — `SELECT` for `{anon,authenticated}` with `USING (true)`.
- `payment_transactions` policy `"Allow authenticated updates for pending transactions"` — `UPDATE` for `{anon,authenticated}` where `status IN ('pending','processing')`, `WITH CHECK (status IN (...'completed'...))`.
- **Impact**: An anonymous actor could flip a pending transaction to `completed` without paying. Webhook should be the only updater; use `service_role` only.

### 3. `backup_schedules` fully open to any authenticated user
- Two policies, both `USING (true) WITH CHECK (true)` for `authenticated`.
- **Impact**: Any signed-in user (including a customer account) can read, create, modify or delete backup schedules.

### 4. `product_categories` fully open to any authenticated user
- Separate INSERT/UPDATE/DELETE policies all with `true`.
- **Impact**: Customer accounts can modify the product taxonomy.

### 5. `customers` table staff policies are blanket-open
- `"Staff can view customers"` `USING (true)`, `"Staff can update customers"` `USING (true) WITH CHECK (true)`, `"Staff can create customers"` `WITH CHECK (true)` — all for `authenticated`.
- **Impact**: Any signed-in user (e.g. a registered customer) can read/modify the full customer database (PII).

### 6. Customer sub-tables fully open to `authenticated`
- `customer_addresses`, `customer_preferences`, `customer_visits` all have `USING (true) WITH CHECK (true)` for authenticated.
- **Impact**: PII leak. Should be scoped by `auth_user_id` ownership or admin role.

### 7. Welcome screen tables writable by anonymous
- `welcome_hero_stats` and `welcome_screen_preferences` allow `INSERT`/`UPDATE` from `{anon,authenticated}` with `true`.
- **Impact**: Any visitor can alter admin-controlled homepage copy/stats.

### 8. `payment_audit_log`, `payment_webhooks`, `payment_attempts` readable by any authenticated user
- Three tables each have `SELECT USING (true)` for `authenticated`.
- **Impact**: Signed-in customers can read raw webhook payloads, audit trails and failed-attempt records, which can include gateway metadata.

### 9. `qr_payment_sessions` policies assigned to `public` role
- Three policies listed under role `{public}` (not `{anon}`).
- **Impact**: In Postgres, `public` is broader than `anon`; it grants the right to every role including service accounts. Likely a typo for `anon` + `service_role`. The "Service role can update" and "Service role can insert" policies are currently granting write rights to anyone.

### 10. `product_addons` "Anyone can view product-addon links" uses `public` role
- Same class of issue as #9 (role `public` vs `anon`). Read-only so impact is lower but still wrong.

## Non-issues (verified safe)

- `payment_gateways` SELECT policy for `{public}` with `USING (is_active = true)` — expected for anon checkout, but confirm no secret keys are stored in this table (credentials should be in secrets, not a readable row). **Action**: verify column contents.
- All 63 tables have `rowsecurity = true`.

## Recommendations (for a follow-up change, not applied here)

1. Replace every `USING (true)` / `WITH CHECK (true)` policy with one that checks admin membership via `admin_users` or ownership via `auth.uid()`.
2. Remove the anon-writable update path on `payment_transactions`; only `service_role` (webhook) should mutate.
3. Switch `qr_payment_sessions` and `product_addons` policies from role `public` to explicit `anon`/`authenticated`/`service_role` as appropriate.
4. Restrict `payment_audit_log`, `payment_webhooks`, `payment_attempts` SELECT to admin role only.
5. Scope `customers` and customer_* tables to owner (`auth_user_id = auth.uid()`) OR admin membership.
6. Restrict `welcome_hero_stats` / `welcome_screen_preferences` writes to admins. Reads can stay public.
7. Restrict `backup_schedules` to admin role.
8. Restrict `product_categories` writes to admin role.

Any of these fixes would be shipped as a **new** migration (no edits to historical files), following the repo's `/*...*/` summary convention.

## Next steps

This document is the finding set; no schema was modified during the audit. Awaiting direction on which remediations to implement.
