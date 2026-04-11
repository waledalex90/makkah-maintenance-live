/** مسار التوجيه بعد نجاح الدخول حسب رتبة الملف الشخصي */
export function postLoginHrefForRole(role: string | null | undefined): string {
  if (role === "technician" || role === "supervisor") return "/tasks/my-work";
  if (role === "reporter" || role === "engineer") return "/dashboard/tickets";
  return "/dashboard";
}

/** يتضمن عمود واجهة الفريق: عند التفعيل يُفضَّل مهام الميدان بغض النظر عن الدور. */
export function postLoginHrefForProfile(profile: {
  role: string | null | undefined;
  access_work_list?: boolean | null;
}): string {
  if (profile.access_work_list) return "/tasks/my-work";
  return postLoginHrefForRole(profile.role);
}
