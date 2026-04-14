# Makkah Maintenance Live - Project Booklet

Version: 1.1  
Date: 2026-04-14  
Prepared for: Operations and Management Team

## Update Note (v1.1)

This update reflects the live rollout of:
- Dynamic roles lifecycle (custom role create/edit/delete guards).
- Tenancy foundation (Phase 1) migrations.
- Tenant-aware RLS starter pack (Phase 2) on core tables.

## 1) Executive Summary

Makkah Maintenance Live is a field-operations platform for Hajj maintenance workflows.  
It centralizes ticket creation, dispatch visibility, zone operations, team management, analytics, and export-ready reports.

Main goals:
- Fast, responsive UI for operations teams.
- Clear role-based access control (RBAC).
- Arabic RTL-friendly experience.
- Real-time operational visibility (maps, chat, status updates).
- Decision-ready reporting with Excel exports.

## 2) Technology Stack

- Frontend framework: Next.js (App Router), React, TypeScript
- Styling/UI: Tailwind CSS, Radix UI, custom UI components
- Data/auth/storage: Supabase
- Client data layer: TanStack React Query
- Charts/analytics: Recharts
- Maps: Leaflet + React Leaflet
- Export engine: xlsx + xlsx-js-style
- Motion/UX: Framer Motion

## 3) Environment Keys (Required)

Create `.env.local` with these keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Notes:
- Do not expose secret keys in frontend code.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- `.env.local` is intentionally git-ignored.

## 4) Core Functional Modules

### 4.1 Authentication and User Context
- Login and identity resolved through Supabase Auth.
- Lightweight profile endpoint at `/api/me` provides:
  - `full_name`
  - `role`
  - `permissions`

### 4.2 Dashboard Shell
- `DashboardShell` wraps all dashboard routes.
- Loads user profile once and derives effective permissions.
- Controls:
  - desktop sidebar collapse
  - mobile sidebar drawer
  - topbar + bottom navigation

### 4.3 Ticket Lifecycle
- Create ticket with metadata and attachments.
- View full details in modal/drawer pattern.
- Track status transitions (`not_received`, `received`, `finished`).
- Field chat and attachments inside ticket detail.

### 4.4 Team and Permissions Management
- Unified team/permissions entry point:
  - `/dashboard/admin/users`
- Dual tabs:
  - Team management
  - Roles and permissions studio
- Supports template-like permission setup for repeatable role assignment.

### 4.5 Reports and Analytics
- KPI and chart-driven dashboard for operations performance.
- Custom report builder supports:
  - column selection
  - column ordering
  - date/zone/status/technician filters
  - template save/apply
- Human-readable exports:
  - names instead of UUIDs
  - formatted times and durations
  - branded header for operations reports

## 5) Access Control Logic (RBAC)

Permission keys used by UI routing and navigation:

- `view_dashboard`
- `view_tickets`
- `view_map`
- `view_reports`
- `manage_zones`
- `manage_users`
- `view_settings`

Highlights:
- Admin always receives full effective permissions.
- Non-admin roles merge role defaults with stored JSON overrides.
- Legacy compatibility key `view_admin_reports` maps to `view_reports`.
- Route-level permission mapping protects dashboard sections.

## 6) API Surface (App Routes)

### User/Profile
- `GET /api/me`

### Admin - Users
- `GET/POST /api/admin/users`
- `PATCH/DELETE /api/admin/users/[userId]`
- `POST /api/admin/users/[userId]/password`
- `POST /api/admin/users/[userId]/role`
- `POST /api/admin/users/bulk`
- `POST /api/admin/users/bulk-delete`
- `GET /api/admin/users/bulk-template`

### Admin - Tickets
- `DELETE /api/admin/tickets/[ticketId]` (plus admin ticket operations)

### Field Operations
- `GET /api/tasks/zone-tickets`
- `POST /api/tasks/zone-tickets/[ticketId]/claim`
- `POST /api/tasks/zone-tickets/[ticketId]/accept`

### Client Diagnostics
- `POST /api/log-client-info`
- `POST /api/log-client-error`

## 7) Data and Storage Requirements

### Supabase Database
Run migrations in order from:
- `supabase/migrations`

### Supabase Storage
Required bucket:
- `tickets`

Recommended:
- Keep private.
- Use secure/signed access strategy when required.

## 8) UX/Performance Decisions

- Page transitions simplified to avoid navigation lag.
- Loading skeletons used for better perceived speed.
- Heavy report visuals isolated/dynamically loaded where needed.
- Modal and drawer scrolling optimized for mobile and desktop.
- Smooth scrolling and compact layout refinements for operational use.

## 9) Deployment and Operations

Primary deployment path:
- Vercel + GitHub auto-deploy from `main`

Checklist:
- Environment keys configured in Vercel
- Supabase URL config updated with production domain
- Migrations applied
- Smoke test on desktop/mobile

### 9.1 Latest Database Rollout (Live)
- Applied successfully via Supabase CLI:
  - `20260510000001_tenancy_core.sql`
  - `20260510000002_add_company_id_nullable.sql`
  - `20260510000003_backfill_default_company.sql`
  - `20260510000004_phase1_hardening.sql`
  - `20260510000005_phase2_rls_starter_pack.sql`
- Legacy migration files were moved to backup folders to resolve duplicate-version conflicts during `db push`.

## 10) Known Operational Notes

- Service worker behavior was hardened to avoid stale route/chunk issues.
- Light theme is enforced as the operational default.
- Build artifact files (for example `tsconfig.tsbuildinfo`) are local artifacts and normally not committed.

## 11) Recommended Handover Package

For management handover, keep these together:
- This booklet (`PROJECT_BOOKLET.md` and `PROJECT_BOOKLET.pdf`)
- `README.md`
- `README-VERCEL.md`
- Latest database migration bundle
- Latest release tag/commit hash

---

End of booklet.
