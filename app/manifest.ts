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
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    iarc_rating_id: "e9227092-2374-42f2-9599-f416629994c6",
    related_applications: [],
    background_color: "#16a34a",
    theme_color: "#16a34a",
    lang: "ar",
    dir: "rtl",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable" as unknown as "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable" as unknown as "any",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/dashboard-placeholder.png",
        sizes: "799x287",
        type: "image/png",
        form_factor: "narrow",
        label: "لوحة التحكم",
      },
      {
        src: "/screenshots/tickets-placeholder.png",
        sizes: "799x287",
        type: "image/png",
        form_factor: "narrow",
        label: "البلاغات",
      },
      {
        src: "/screenshots/wide-placeholder.png",
        sizes: "799x287",
        type: "image/png",
        form_factor: "wide",
        label: "واجهة النظام - عرض أفقي",
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
  } as MetadataRoute.Manifest & {
    display_override: string[];
    iarc_rating_id: string;
    related_applications: [];
  };
}
