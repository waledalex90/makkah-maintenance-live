/** مسار التوجيه بعد نجاح الدخول حسب رتبة الملف الشخصي */
export function postLoginHrefForRole(role: string | null | undefined): string {
  if (role === "technician" || role === "supervisor") return "/tasks/my-work";
  if (role === "reporter" || role === "engineer") return "/dashboard/tickets";
  return "/dashboard";
}
