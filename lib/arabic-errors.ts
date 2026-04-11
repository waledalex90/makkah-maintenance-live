/**
 * تحويل رسائل الأخطاء الشائعة (خادم / قاعدة بيانات) إلى عربية مفهومة.
 * إن لم تُعرَف الرسالة تُعاد كما هي (قد تكون عربية أصلًا).
 */
export function arabicErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("jwt") || m.includes("session") || m.includes("expired")) {
    return "انتهت الجلسة. يرجى تسجيل الدخول مجددًا.";
  }
  if (m.includes("permission") || m.includes("policy") || m.includes("row-level security")) {
    return "لا تملك صلاحية لتنفيذ هذا الإجراء.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) {
    return "تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.";
  }
  if (m.includes("duplicate") || m.includes("unique")) {
    return "هذه القيمة مسجّلة مسبقًا. استخدم قيمة أخرى.";
  }
  if (m.includes("foreign key") || m.includes("violates")) {
    return "لا يمكن الربط: البيانات المرتبطة غير موجودة أو محظورة.";
  }
  if (m.includes("null value") || m.includes("not null")) {
    return "حقل مطلوب ناقص. أكمل جميع الحقول الإلزامية.";
  }
  if (m.includes("invalid input")) {
    return "قيمة غير صالحة. راجع المدخلات.";
  }
  if (m.includes("timeout")) {
    return "انتهت مهلة الطلب. أعد المحاولة.";
  }
  return message;
}
