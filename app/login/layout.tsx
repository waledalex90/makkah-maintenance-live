import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تسجيل الدخول | UP FLOW",
  description: "بوابة المنصة — UP FLOW. تسجيل الدخول للوصول إلى لوحة التشغيل.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
