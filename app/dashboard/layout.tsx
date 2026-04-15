import { DashboardShell } from "@/components/dashboard-shell";
import { PlatformRootGuard } from "@/components/platform-root-guard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlatformRootGuard>
      <DashboardShell>{children}</DashboardShell>
    </PlatformRootGuard>
  );
}
