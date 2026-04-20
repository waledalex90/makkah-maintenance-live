import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { SubscriptionPlansAdminContent } from "@/components/subscription-plans-admin-content";

export default async function AdminSubscriptionsPage() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    redirect("/dashboard");
  }

  return <SubscriptionPlansAdminContent />;
}
