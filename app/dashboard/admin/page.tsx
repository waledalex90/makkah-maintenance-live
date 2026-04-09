import { redirect } from "next/navigation";

export default async function AdminDashboardPage() {
  return redirect("/dashboard");
}