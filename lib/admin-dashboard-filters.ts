/** فلاتر مشتركة لإحصاءات وجدول البلاغات في لوحة التحكم */
export type DashboardBaseFilters = {
  zoneId: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
};

/** يطبّق منطقة + تصنيف + فترة زمنية (توقيت مكة +03:00) على استعلام جدول tickets */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- سلسلة PostgREST ديناميكية
export function applyTicketDashboardFilters(query: any, f: DashboardBaseFilters): any {
  let q = query;
  if (f.zoneId && f.zoneId !== "all") q = q.eq("zone_id", f.zoneId);
  if (f.categoryId && f.categoryId !== "all") {
    const id = Number.parseInt(f.categoryId, 10);
    if (Number.isFinite(id)) q = q.eq("category_id", id);
  }
  if (f.dateFrom?.trim()) q = q.gte("created_at", `${f.dateFrom.trim()}T00:00:00.000+03:00`);
  if (f.dateTo?.trim()) q = q.lte("created_at", `${f.dateTo.trim()}T23:59:59.999+03:00`);
  return q;
}

export type DashboardUrlFilterState = {
  zoneId: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
  statusTable: string;
  statCard: string;
  search: string;
  page: number;
};

export function parseDashboardFiltersFromSearchParams(sp: URLSearchParams): DashboardUrlFilterState {
  return {
    zoneId: sp.get("zf") ?? "all",
    categoryId: sp.get("cat") ?? "all",
    dateFrom: sp.get("df") ?? "",
    dateTo: sp.get("dt") ?? "",
    statusTable: sp.get("tst") ?? "all",
    statCard: sp.get("sf") ?? "all",
    search: sp.get("q") ?? "",
    page: Math.max(1, Number.parseInt(sp.get("p") || "1", 10) || 1),
  };
}

export function mergeDashboardSearchParams(
  current: URLSearchParams,
  patch: Partial<Record<string, string | undefined>>,
  resetPage: boolean,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  Object.entries(patch).forEach(([k, v]) => {
    if (v === undefined || v === "" || v === "all") next.delete(k);
    else next.set(k, v);
  });
  if (resetPage) next.delete("p");
  return next;
}
