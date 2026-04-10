# Makkah Maintenance Live

Operational ticketing system built with Next.js + Supabase.

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase project (URL + anon key)

## 1) Install dependencies

```bash
npm install
```

## 2) Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

## 3) Run database migrations (Supabase SQL Editor)

Run migrations in order:

1. `supabase/migrations/20260409_001_initial_hajj_maintenance.sql`
2. `supabase/migrations/20260409_002_admin_zones_rls.sql`
3. `supabase/migrations/20260409_003_ticket_priority_and_coordinates.sql`
4. `supabase/migrations/20260409_004_realtime_messages_and_ticket_comments.sql`
5. `supabase/migrations/20260409_005_global_and_ticket_messages.sql`
6. `supabase/migrations/20260409_006_zone_profiles_notifications_and_claim.sql`
7. `supabase/migrations/20260409_007_reporter_sla_reports_and_perf.sql`

## 4) Required Supabase Storage buckets

Create bucket:

- `ticket-message-attachments`

Recommended:

- Keep bucket private.
- Use signed URLs if you need strict media access.

## 5) Start development server

```bash
npm run dev
```

Open: `http://localhost:3000`

## Roles summary

- `admin`: full access, reports, users, zones.
- `reporter`: create ticket + follow-up chat only.
- `engineer`: zone-level assignment/claim access.
- `supervisor` / `technician`: operations workflow access.

## Git notes

Tracked ignore rules already include:

- `node_modules`
- `.next`
- `.env.local`
