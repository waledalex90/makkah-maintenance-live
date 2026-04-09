"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TicketDetailDrawer } from "@/components/ticket-detail-drawer";

type Zone = {
  id: string;
  name: string;
};

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

type TicketRow = {
  id: string;
  location: string;
  description: string;
  status: TicketStatus;
  zone_id: string | null;
  created_at: string;
};

type TicketChatRow = {
  ticket_id: string;
  sent_at: string;
};

const IN_PROGRESS_STATUSES: TicketStatus[] = ["assigned", "on_the_way", "arrived"];
const PAGE_SIZE = 10;
const LAST_READ_STORAGE_KEY = "admin_ticket_last_read_map";

function statusBadgeVariant(status: TicketStatus): "red" | "yellow" | "green" | "muted" {
  if (status === "new") return "red";
  if (status === "on_the_way") return "yellow";
  if (status === "fixed") return "green";
  return "muted";
}

export function AdminDashboardContent() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [allTickets, setAllTickets] = useState<TicketRow[]>([]);
  const [pageTickets, setPageTickets] = useState<TicketRow[]>([]);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [latestChatMap, setLatestChatMap] = useState<Record<string, string>>({});
  const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});

  const zoneNameMap = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach((zone) => map.set(zone.id, zone.name));
    return map;
  }, [zones]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_READ_STORAGE_KEY);
      if (stored) {
        setLastReadMap(JSON.parse(stored) as Record<string, string>);
      }
    } catch {
      setLastReadMap({});
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LAST_READ_STORAGE_KEY, JSON.stringify(lastReadMap));
  }, [lastReadMap]);

  const loadZones = async () => {
    const { data, error } = await supabase.from("zones").select("id, name").order("name");
    if (error) {
      toast.error(error.message);
      return;
    }
    setZones(data ?? []);
  };

  const loadStats = async () => {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, location, description, status, zone_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }

    setAllTickets((data as TicketRow[]) ?? []);
  };

  const loadLatestChatsForTickets = async (ticketIds: string[]) => {
    if (ticketIds.length === 0) {
      setLatestChatMap({});
      return;
    }

    const { data, error } = await supabase
      .from("ticket_chats")
      .select("ticket_id, sent_at")
      .in("ticket_id", ticketIds)
      .order("sent_at", { ascending: false });

    if (error) {
      return;
    }

    const map: Record<string, string> = {};
    ((data as TicketChatRow[]) ?? []).forEach((row) => {
      if (!map[row.ticket_id]) {
        map[row.ticket_id] = row.sent_at;
      }
    });
    setLatestChatMap(map);
  };

  const loadPage = async () => {
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("tickets")
      .select("id, location, description, status, zone_id, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (zoneFilter !== "all") {
      query = query.eq("zone_id", zoneFilter);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const q = searchTerm.trim();
    if (q) {
      query = query.or(`location.ilike.%${q}%,id.ilike.%${q}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      toast.error(error.message);
      return;
    }

    const rows = (data as TicketRow[]) ?? [];
    setPageTickets(rows);
    setTotalCount(count ?? 0);
    await loadLatestChatsForTickets(rows.map((ticket) => ticket.id));
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadZones(), loadStats()]);
      await loadPage();
      setLoading(false);
    };

    void init();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [zoneFilter, statusFilter, searchTerm]);

  useEffect(() => {
    void loadPage();
  }, [zoneFilter, statusFilter, searchTerm, currentPage]);

  const openTicketDrawer = async (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
    setLastReadMap((prev) => ({ ...prev, [ticket.id]: new Date().toISOString() }));
  };

  const openTicketById = async (ticketId: string) => {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, location, description, status, zone_id, created_at")
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      toast.error("Unable to open ticket details.");
      return;
    }

    await openTicketDrawer(data as TicketRow);
  };

  const refreshAfterDrawerAction = async () => {
    await Promise.all([loadStats(), loadPage()]);
    if (selectedTicket) {
      const { data } = await supabase
        .from("tickets")
        .select("id, location, description, status, zone_id, created_at")
        .eq("id", selectedTicket.id)
        .single();

      if (data) {
        setSelectedTicket(data as TicketRow);
      }
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel("tickets-admin-advanced-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        (payload) => {
          const newTicket = payload.new as TicketRow;
          toast.success(`New ticket: ${newTicket.location}`, {
            action: {
              label: "Open",
              onClick: () => {
                void openTicketById(newTicket.id);
              },
            },
          });
          void loadStats();
          void loadPage();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        async (payload) => {
          const updated = payload.new as TicketRow;
          setPageTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, status: updated.status } : t)));
          if (selectedTicket?.id === updated.id) {
            setSelectedTicket((prev) => (prev ? { ...prev, status: updated.status } : prev));
          }
          await Promise.all([loadStats(), loadPage()]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_chats" },
        (payload) => {
          const row = payload.new as TicketChatRow;
          setLatestChatMap((prev) => ({ ...prev, [row.ticket_id]: row.sent_at }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id]);

  const stats = useMemo(() => {
    const total = allTickets.length;
    const newCount = allTickets.filter((t) => t.status === "new").length;
    const inProgressCount = allTickets.filter((t) => IN_PROGRESS_STATUSES.includes(t.status)).length;
    const fixedCount = allTickets.filter((t) => t.status === "fixed").length;

    return { total, newCount, inProgressCount, fixedCount };
  }, [allTickets]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardTitle>Total Tickets</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{stats.total}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>New</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-red-600">{stats.newCount}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>In Progress</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-yellow-600">{stats.inProgressCount}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Fixed</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-green-600">{stats.fixedCount}</p></CardContent></Card>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-2 text-sm font-medium">Zone</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
            >
              <option value="all">All zones</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Status</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="assigned">Assigned</option>
              <option value="on_the_way">On the way</option>
              <option value="arrived">Arrived</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Quick Search</p>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by room or location"
            />
          </div>
        </div>

        <p className="mb-2 text-xs text-slate-500">Sorted by newest first (Created At desc)</p>

        {loading ? (
          <p className="text-sm text-slate-500">Loading tickets...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {pageTickets.map((ticket) => {
                  const latestChatAt = latestChatMap[ticket.id];
                  const lastReadAt = lastReadMap[ticket.id];
                  const hasUnread = Boolean(
                    latestChatAt && (!lastReadAt || new Date(latestChatAt).getTime() > new Date(lastReadAt).getTime()),
                  );

                  return (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => void openTicketDrawer(ticket)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{ticket.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{ticket.location}</td>
                      <td className="px-3 py-2">{ticket.zone_id ? zoneNameMap.get(ticket.zone_id) ?? "-" : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadgeVariant(ticket.status)}>{ticket.status}</Badge>
                          {hasUnread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-3 py-2">{ticket.description}</td>
                    </tr>
                  );
                })}
                {pageTickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">No tickets found for current filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">Page {currentPage} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <TicketDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ticket={selectedTicket}
        zoneName={selectedTicket?.zone_id ? zoneNameMap.get(selectedTicket.zone_id) ?? "-" : "-"}
        onTicketUpdated={refreshAfterDrawerAction}
        onMarkTicketRead={(ticketId, readAt) => setLastReadMap((prev) => ({ ...prev, [ticketId]: readAt }))}
      />
    </div>
  );
}