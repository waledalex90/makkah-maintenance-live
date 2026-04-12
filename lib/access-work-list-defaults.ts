/** واجهة مهام الميدان/العمليات: تفعّل افتراضياً للأدوار الميدانية + مدخل بيانات فقط */
export function defaultAccessWorkListForRole(role: string | null | undefined): boolean {
  return (
    role === "technician" ||
    role === "engineer" ||
    role === "supervisor" ||
    role === "data_entry"
  );
}
