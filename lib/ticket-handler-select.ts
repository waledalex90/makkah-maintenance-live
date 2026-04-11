/**
 * حقول البلاغ + join على profiles لعرض من يتولى المتابعة بعد الاستلام.
 * يُستخدم مع supabase.from("tickets").select(...)
 */
export const TICKET_ROW_WITH_HANDLER_PROFILES =
  "id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, category_id, ticket_categories(name), location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at, closed_at, closed_by, " +
  "assigned_technician:profiles!assigned_technician_id(full_name), " +
  "assigned_supervisor:profiles!assigned_supervisor_id(full_name), " +
  "assigned_engineer:profiles!assigned_engineer_id(full_name), " +
  "closed_by_profile:profiles!closed_by(full_name)";

/** نسخة ميدان (مهام الفني) بدون حقول الخريطة */
export const ZONE_TICKET_WITH_HANDLER_PROFILES =
  "id, ticket_number, external_ticket_number, location, description, status, created_at, assigned_technician_id, assigned_supervisor_id, assigned_engineer_id, zone_id, category_id, category, ticket_categories(name), zones(name), closed_by, " +
  "assigned_technician:profiles!assigned_technician_id(full_name), " +
  "assigned_supervisor:profiles!assigned_supervisor_id(full_name), " +
  "assigned_engineer:profiles!assigned_engineer_id(full_name), " +
  "closed_by_profile:profiles!closed_by(full_name)";

/** لوحة تفاصيل البلاغ (فني/مشرف) */
export const TICKET_DRAWER_WITH_HANDLER_PROFILES =
  "id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, category_id, category, ticket_categories(name), zones(name), created_at, closed_at, closed_by, " +
  "assigned_technician:profiles!assigned_technician_id(full_name), " +
  "assigned_supervisor:profiles!assigned_supervisor_id(full_name), " +
  "assigned_engineer:profiles!assigned_engineer_id(full_name), " +
  "closed_by_profile:profiles!closed_by(full_name)";
