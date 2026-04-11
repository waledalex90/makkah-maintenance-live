/** ترجمة أخطاء Supabase Auth إلى عربي واضح للمستخدم */
export function mapAuthErrorToArabic(err: {
  message: string;
  code?: string;
  status?: number;
}): string {
  const msg = (err.message || "").trim();
  const code = err.code ?? "";
  const lower = msg.toLowerCase();

  if (code === "email_not_confirmed" || lower.includes("email not confirmed") || lower.includes("confirm your email")) {
    return "يجب تأكيد البريد قبل الدخول. إن كان حسابك جديداً، اطلب من الإدارة التأكد من تفعيله، أو راجع بريدك للرابط.";
  }

  if (
    code === "invalid_credentials" ||
    lower === "invalid login credentials" ||
    lower.includes("invalid login") ||
    lower.includes("invalid credentials")
  ) {
    return "البريد أو اسم المستخدم غير مطابق لأي حساب، أو كلمة المرور غير صحيحة.";
  }

  if (code === "user_not_found" || lower.includes("user not found")) {
    return "الحساب غير موجود في النظام. تحقق من الاسم أو راجع الإدارة.";
  }

  if (lower.includes("too many requests") || lower.includes("rate limit") || code === "over_request_rate_limit") {
    return "تم تجاوز عدد المحاولات. انتظر دقيقة ثم أعد المحاولة.";
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return "تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.";
  }

  if (msg) return msg;
  return "تعذر تسجيل الدخول. تحقق من البيانات أو اتصل بالإدارة.";
}
