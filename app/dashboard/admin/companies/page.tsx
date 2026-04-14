import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { PlatformCompaniesContent } from "@/components/platform-companies-content";

export default async function AdminCompaniesPage() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    redirect("/dashboard");
  }

  return <PlatformCompaniesContent />;
}

