import Link from "next/link";
import { AccountSettingsContent } from "@/components/account-settings-content";

export default function TasksSettingsPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="mx-auto max-w-md sm:max-w-2xl space-y-4">
        <Link
          href="/tasks/my-work"
          className="inline-flex text-sm font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
        >
          ← العودة لقائمة العمل
        </Link>
        <AccountSettingsContent />
      </div>
    </main>
  );
}
