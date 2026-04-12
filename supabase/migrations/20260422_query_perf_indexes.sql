-- فهارس إضافية لاستعلامات قوائم البلاغات والملفات (فلاتر شائعة + رسائل حسب البلاغ)

create index if not exists idx_tickets_zone_status_created
  on public.tickets (zone_id, status, created_at desc);

create index if not exists idx_tickets_status_created
  on public.tickets (status, created_at desc);

create index if not exists idx_ticket_messages_ticket_created
  on public.ticket_messages (ticket_id, created_at desc);

create index if not exists idx_profiles_region_lower
  on public.profiles (lower(trim(coalesce(region, ''))));

create index if not exists idx_profiles_specialty
  on public.profiles (specialty);
