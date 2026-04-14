# RBAC Dynamic Roles Runbook

## 1) Enable
- Keep `RBAC_DYNAMIC_ROLES_ENABLED=false` by default in production.
- Apply migration `20260501_001_dynamic_roles_foundation.sql`.
- Verify `roles` table seeded with system roles and `profiles.role_id` backfilled.
- Enable flag in staging first:
  - `RBAC_DYNAMIC_ROLES_ENABLED=true`
- Validate:
  - Admin users page loads users + roles
  - Create custom role + edit permissions
  - Assign role to user
  - Open ticket from `/dashboard/tasks` in-place modal

## 2) Monitor
- Watch API logs for `[rbac-authz]` and `[rbac-path-access]`.
- Check for spikes in:
  - 400 from `/api/admin/users/*`
  - 403 from auth guards
- Confirm no unexpected redirects from `/dashboard/tasks`.

## 3) Rollback
- Set `RBAC_DYNAMIC_ROLES_ENABLED=false` and redeploy env.
- Legacy `profiles.role` remains intact and continues serving RLS logic.
- Do **not** drop `roles` or `profiles.role_id` columns during rollback window.
- Investigate bad records and re-enable flag after staging verification.

