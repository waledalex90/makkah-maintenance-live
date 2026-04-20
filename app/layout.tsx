import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";
import { FieldSetupWizardGate } from "@/components/field-setup-wizard-gate";
import { PwaRegister } from "@/components/pwa-register";
import { QueryClientProviderWrapper } from "@/components/query-client-provider";

export const metadata: Metadata = {
  title: "UP FLOW",
  description: "منصة تشغيل ميداني متعددة للشركات — بلاغات، خريطة، فريق.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{localStorage.setItem("theme","light");document.documentElement.classList.remove("dark")}catch(e){document.documentElement.classList.remove("dark")}})();`,
          }}
        />
        <QueryClientProviderWrapper>
          <PwaRegister />
          <Suspense fallback={null}>
            <FieldSetupWizardGate />
          </Suspense>
          {children}
          <AppToaster />
        </QueryClientProviderWrapper>
      </body>
    </html>
  );
}