import type { MetadataRoute } from "next";
import { ASSET_VERSION } from "@/lib/asset-version";

const v = `?v=${ASSET_VERSION}`;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UP FLOW",
    short_name: "UP FLOW",
    description: "UP FLOW — منصة تشغيل ميداني متعددة للشركات",
    id: "/",
    categories: ["business", "productivity"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    prefer_related_applications: false,
    display_override: ["standalone", "minimal-ui"],
    handle_links: "auto",
    launch_handler: { client_mode: "navigate-existing" },
    orientation: "portrait",
    iarc_rating_id: "e9227092-2374-42f2-9599-f416629994c6",
    related_applications: [],
    background_color: "#f8fafc",
    theme_color: "#1e3a5f",
    lang: "ar",
    dir: "rtl",
    icons: [
      {
        src: `/android-chrome-192x192.png${v}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable" as unknown as "any",
      },
      {
        src: `/android-chrome-512x512.png${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/android-chrome-512x512.png${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
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
    handle_links: "auto";
    launch_handler: { client_mode: "navigate-existing" };
  };
}
