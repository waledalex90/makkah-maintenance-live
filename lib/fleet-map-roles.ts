/**
 * من يُعرض على خريطة التشغيل من live_locations:
 * فني، مراقب، مهندس، مدير مشروع، مدير مشاريع، مدخل بيانات — استثناء Admin فقط.
 * يتوافق مع سياسات RLS في هجرة 20260413.
 */
export const FLEET_MAP_ROLES = [
  "technician",
  "supervisor",
  "engineer",
  "project_manager",
  "projects_director",
  "reporter",
] as const;

export type FleetMapRole = (typeof FLEET_MAP_ROLES)[number];

export function isFleetMapRole(role: string | null | undefined): role is FleetMapRole {
  if (!role) return false;
  return (FLEET_MAP_ROLES as readonly string[]).includes(role);
}
