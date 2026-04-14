import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { PlatformMonitoringContent } from "@/components/platform-monitoring-content";

export default async function AdminMonitoringPage() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    redirect("/dashboard");
  }

  return <PlatformMonitoringContent />;
}

