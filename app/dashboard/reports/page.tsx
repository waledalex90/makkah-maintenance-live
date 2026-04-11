import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TopPerformer = {
  id: string;
  full_name: string;
  completed_count: number;
};

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  const perms = profile?.permissions as { view_admin_reports?: boolean } | null | undefined;
  const allowedRole = profile?.role && ["admin", "project_manager", "projects_director"].includes(profile.role);
  const allowedByPermission = Boolean(perms?.view_admin_reports);
  if (!allowedRole && !allowedByPermission) {
    redirect("/dashboard/tickets");
  }

  const { count: totalDone } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "fixed");

  const { data: solvedRows } = await supabase
    .from("tickets")
    .select("created_at, closed_at")
    .eq("status", "fixed")
    .not("closed_at", "is", null);

  const avgHours =
    solvedRows && solvedRows.length > 0
      ? solvedRows.reduce((sum, row) => {
          const created = new Date(row.created_at).getTime();
          const closed = new Date((row.closed_at as string) ?? row.created_at).getTime();
          return sum + Math.max(0, (closed - created) / (1000 * 60 * 60));
        }, 0) / solvedRows.length
      : 0;

  const { data: topRows } = await supabase
    .from("tickets")
    .select("assigned_to")
    .eq("status", "fixed")
    .not("assigned_to", "is", null);

  const counts: Record<string, number> = {};
  (topRows ?? []).forEach((row) => {
    const id = row.assigned_to as string;
    counts[id] = (counts[id] ?? 0) + 1;
  });
  const topIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let topPerformers: TopPerformer[] = [];
  if (topIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", topIds);
    const nameMap = new Map<string, string>((profiles ?? []).map((row) => [row.id, row.full_name]));
    topPerformers = topIds.map((id) => ({
      id,
      full_name: nameMap.get(id) ?? id.slice(0, 8),
      completed_count: counts[id] ?? 0,
    }));
  }

  return (
    <div className="space-y-4" dir="rtl" lang="ar">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">التقارير</h1>
        <p className="mt-1 text-sm text-slate-500">لوحة مؤشرات التنفيذ وساعات الاستجابة والحل.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">إجمالي البلاغات المنفذة</p>
          <p className="mt-2 text-3xl font-bold text-green-600">{totalDone ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">متوسط وقت الحل</p>
          <p className="mt-2 text-3xl font-bold text-indigo-600">{avgHours.toFixed(2)} ساعة</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">الموظفون المصنفون</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{topPerformers.length}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">أعلى 5 موظفين إنجازًا</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2">الترتيب</th>
                <th className="px-3 py-2">الاسم</th>
                <th className="px-3 py-2">عدد المهام</th>
              </tr>
            </thead>
            <tbody>
              {topPerformers.map((row, index) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-3 py-2">{row.full_name}</td>
                  <td className="px-3 py-2">{row.completed_count}</td>
                </tr>
              ))}
              {topPerformers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-slate-500">لا توجد بيانات كافية.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
