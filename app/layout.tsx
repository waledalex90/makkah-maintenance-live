import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";
import { FieldSetupWizardGate } from "@/components/field-setup-wizard-gate";
import { PwaRegister } from "@/components/pwa-register";
import { QueryClientProviderWrapper } from "@/components/query-client-provider";

export const metadata: Metadata = {
  title: "Makkah Operations Center",
  description: "Hajj maintenance operations dashboard",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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