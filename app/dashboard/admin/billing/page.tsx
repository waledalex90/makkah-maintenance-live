import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { PlatformBillingContent } from "@/components/platform-billing-content";

export default async function PlatformBillingPage() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    redirect("/dashboard");
  }

  return <PlatformBillingContent />;
}
