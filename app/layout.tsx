import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";

export const metadata: Metadata = {
  title: "Makkah Operations Center",
  description: "Hajj maintenance operations dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}