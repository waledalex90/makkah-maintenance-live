import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";
import { FieldSetupWizardGate } from "@/components/field-setup-wizard-gate";
import { PwaRegister } from "@/components/pwa-register";
import { QueryClientProviderWrapper } from "@/components/query-client-provider";
import { ASSET_VERSION } from "@/lib/asset-version";

const v = `?v=${ASSET_VERSION}`;

export const metadata: Metadata = {
  title: "UP FLOW",
  description: "منصة تشغيل ميداني متعددة للشركات — بلاغات، خريطة، فريق.",
  manifest: `/manifest.webmanifest${v}`,
  icons: {
    icon: [
      { url: `/favicon-v2.ico${v}`, sizes: "32x32" },
      { url: `/android-chrome-192x192.png${v}`, sizes: "192x192", type: "image/png" },
      { url: `/android-chrome-512x512.png${v}`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `/apple-touch-icon.png${v}`, sizes: "180x180", type: "image/png" }],
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