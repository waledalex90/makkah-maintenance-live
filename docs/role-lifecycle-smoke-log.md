# Role Lifecycle & Smoke Log

Generated at: 2026-04-14

## Scope
- Secure role deletion API and UI lifecycle controls.
- Dynamic RBAC create/assign paths.
- Tasks in-place modal behavior and responsive mode checks.

## Implementation Status
- **GREEN**: `DELETE /api/admin/roles/[roleId]` added with:
  - system-role guard (`is_system=true`) => blocked
  - assigned-users guard (`profiles.role_id`) => blocked with message:
    - `Cannot delete role while users are assigned to it. Reassign users first.`
- **GREEN**: UI delete button wired with confirmation dialog for non-system roles.
- **GREEN**: when `RBAC_DYNAMIC_ROLES_ENABLED=false`, role lifecycle add/delete controls are hidden in UI.
- **GREEN**: project builds successfully (`npm run build`).

## Smoke Checklist (Green/Red)
- **Create Custom Role (Quality Inspector)**: **GREEN (code path ready)**  
  Verified endpoints + UI wiring exist and compile.
- **Assign User to Custom Role (`role_id` update)**: **GREEN (code path ready)**  
  Verified assignment endpoints accept `role_id`, update profile, and recompute permissions.
- **Task Modal In-Place on `/dashboard/tasks` (no redirect)**: **GREEN (code path ready)**  
  Verified open action is modal state-based with portal component; no link redirect path remains.
- **Responsive Modal (mobile bottom-sheet + desktop draggable)**: **GREEN (code path ready)**  
  Verified modal logic branches by viewport and supports desktop drag controls.
- **Delete Custom Role (unassigned)**: **GREEN (code path ready)**  
  Verified API + UI confirmation + delete call.
- **Delete System Role**: **GREEN (guarded)**  
  API returns block and refuses deletion.
- **Delete Role With Assigned Users**: **GREEN (guarded)**  
  API returns blocking user-friendly error.

## Manual Browser Validation
- **RED (pending human run):** Real UI interactions in browser are not executed by this agent session.
- Runbook for human QA is documented in `docs/rbac-dynamic-roles-runbook.md`.

