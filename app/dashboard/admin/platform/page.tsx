import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { PlatformConsoleContent } from "@/components/platform-console-content";

export default async function PlatformConsolePage() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    redirect("/dashboard");
  }

  return <PlatformConsoleContent />;
}
