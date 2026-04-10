import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Makkah Operations Center",
  description: "Hajj maintenance operations dashboard",
  manifest: "/manifest.webmanifest",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}