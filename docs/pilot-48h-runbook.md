# Pilot Runbook - 48 Hours

## Objective

Validate multi-tenant behavior, scoped RBAC, and operator UX in live conditions before full rollout.

## Scope

- Pilot companies: `pilot-company-a`, `pilot-company-b`
- Pilot duration: 48 hours
- Focus areas:
  - Org Switcher
  - Tenant isolation
  - Role assignment scope
  - Branding context
  - Critical admin workflows

## Test Accounts

- Platform Admin: existing protected admin account
- User A (Company A): `pilot.a@makkah-maintenance.test`
- User B (Company B): `pilot.b@makkah-maintenance.test`

## Day 0 (Pre-Pilot, 30-45 min)

1. Confirm production health:
   - App opens and login works.
   - `/dashboard/admin/users` loads without 4xx/5xx.
2. Confirm platform admin visibility:
   - Can see both pilot companies in Org context.
3. Confirm tenant users:
   - User A signs in and sees Company A scope only.
   - User B signs in and sees Company B scope only.
4. Confirm role controls:
   - Tenant admin can create/edit tenant role in active company.
   - Tenant admin cannot edit/delete global system roles.

## Day 1 (Execution Window)

### Checklist A - Isolation

- A cannot see B users/tickets/zones.
- B cannot see A users/tickets/zones.
- Cross-tenant role assignment attempts are rejected.

### Checklist B - RBAC Scope

- Role dropdown in Users page shows:
  - Global system roles
  - Tenant roles for active company only
- Switching active company changes role options accordingly.

### Checklist C - UX and Branding

- Topbar updates company name/logo on switch.
- No blocking flicker (skeleton appears briefly, then stable UI).
- Navigation and permissions update after company switch.

## Day 2 (Stability Window)

1. Repeat core scenarios with fresh browser sessions.
2. Verify no stale permission cache behavior after switch.
3. Review logs for:
   - unexpected `403`
   - tenant guard rejections
   - role resolution failures

## Exit Criteria (Green Light)

Pilot is considered PASS when all are true:

- Zero cross-tenant data exposure incidents.
- Zero unauthorized role mutation on global roles.
- Org Switcher updates scope and branding reliably.
- No blocking production incidents from pilot users.

## Rollback Trigger

Rollback is required if any of the following occurs:

- Cross-tenant read/write succeeds unexpectedly.
- Global role mutation allowed from tenant scope.
- Repeated login/session failures tied to active company switch.

Immediate action:

1. Freeze tenant role mutations.
2. Restrict to platform-admin-only role operations.
3. Re-run guard checklist SQL and incident triage.

