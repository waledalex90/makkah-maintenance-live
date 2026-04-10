import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "نظام عزام",
    short_name: "عزام",
    description: "نظام عزام لإدارة البلاغات والصيانة الميدانية",
    id: "/?source=pwa",
    categories: ["business", "productivity", "utilities"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    lang: "ar",
    dir: "rtl",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/dashboard-placeholder.png",
        sizes: "400x400",
        type: "image/png",
        form_factor: "narrow",
        label: "لوحة التحكم",
      },
      {
        src: "/screenshots/tickets-placeholder.png",
        sizes: "400x400",
        type: "image/png",
        form_factor: "narrow",
        label: "البلاغات",
      },
    ],
    shortcuts: [
      {
        name: "إنشاء بلاغ جديد",
        short_name: "بلاغ جديد",
        description: "فتح شاشة إنشاء بلاغ بسرعة",
        url: "/dashboard/tickets",
      },
      {
        name: "الخريطة",
        short_name: "الخريطة",
        description: "عرض الخريطة التشغيلية",
        url: "/dashboard/map",
      },
      {
        name: "لوحة التحكم",
        short_name: "اللوحة",
        description: "فتح لوحة التحكم الرئيسية",
        url: "/dashboard",
      },
    ],
  };
}
