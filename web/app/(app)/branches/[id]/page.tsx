import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import {
  getAlerts,
  getBranch,
  getCameras,
  getCashBalances,
  getEvents,
  getExchangeRates,
  getShifts,
} from "@/lib/queries";
import { AlertCard } from "@/components/Cards";
import { AlertsRealtime, EventsRealtime } from "@/components/Realtime";
import { Timeline } from "@/components/Timeline";
import { EmptyState, PageHeader, SectionTitle } from "@/components/Layout";
import { CameraStatusBadge, EntityStatusBadge } from "@/components/StatusBadge";
import {
  formatDateTime,
  formatMoney,
  formatWorkingHours,
  humanize,
  timeAgo,
} from "@/lib/format";
import type { TimelineItem } from "@/lib/types";

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  const branch = await getBranch(supabase, id);
  if (!branch) notFound();

  const [cameras, rates, cash, shifts, openAlerts, events] = await Promise.all([
    getCameras(supabase, branch.id),
    getExchangeRates(supabase, branch.id),
    getCashBalances(supabase, branch.id),
    getShifts(supabase, branch.id),
    getAlerts(supabase, { branchId: branch.id, status: "open", limit: 50 }),
    getEvents(supabase, { branchId: branch.id, limit: 30 }),
  ]);

  const onlineCameras = cameras.filter((c) => c.status === "online").length;
  const activeShift = shifts.find((s) => s.status === "active");

  const timeline: TimelineItem[] = events.map((e) => ({
    id: e.id,
    time: e.timestamp,
    title: humanize(e.event_type),
    description:
      typeof e.raw_payload?.message === "string" ? e.raw_payload.message : undefined,
    kind: "event" as const,
    severity: e.severity,
  }));
  for (const a of openAlerts) {
    timeline.push({
      id: `alert-${a.id}`,
      time: a.created_at,
      title: `Alert: ${a.title}`,
      kind: "alert",
      severity: a.severity,
    });
  }
  timeline.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <div>
      <AlertsRealtime />
      <EventsRealtime />
      <PageHeader
        kicker="Branch"
        title={branch.name}
        actions={
          <Link
            href="/branches"
            className="rounded-md border border-line px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:bg-card"
          >
            ← All branches
          </Link>
        }
      />

      {/* Status strip */}
      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-line bg-card p-4">
        <EntityStatusBadge status={branch.status} />
        <span className="text-[13px] text-ink-soft">
          <span className="font-semibold text-ink">{onlineCameras}/{cameras.length}</span> cameras online
        </span>
        <span className="text-[13px] text-ink-soft">
          {activeShift
            ? <><span className="font-semibold text-ink">{activeShift.employee_name ?? "Staff"}</span> on shift until {formatDateTime(activeShift.end_time)}</>
            : "No active shift"}
        </span>
        <span className="text-[13px] text-muted">{formatWorkingHours(branch.working_hours)}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {openAlerts.length > 0 ? (
            <section>
              <SectionTitle>Open alerts ({openAlerts.length})</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {openAlerts.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionTitle>Timeline</SectionTitle>
            <Timeline items={timeline.slice(0, 30)} />
          </section>
        </div>

        <div className="space-y-6">
          {/* Exchange rates */}
          <section className="rounded-lg border border-line bg-card p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Exchange rates
            </h2>
            {rates.length === 0 ? (
              <EmptyState title="No rates" message="No exchange rates configured." />
            ) : (
              <table className="table-dense w-full">
                <thead>
                  <tr>
                    <th>CCY</th>
                    <th className="text-right">Buy</th>
                    <th className="text-right">Sell</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id}>
                      <td className="font-semibold">{r.currency}</td>
                      <td className="text-right tabular-nums">{r.buy_rate}</td>
                      <td className="text-right tabular-nums">{r.sell_rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Cash */}
          <section className="rounded-lg border border-line bg-card p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Cash balances
            </h2>
            {cash.length === 0 ? (
              <EmptyState title="No data" message="No cash balances reported." />
            ) : (
              <ul className="space-y-2.5">
                {cash.map((c) => {
                  const below = c.amount < c.threshold;
                  return (
                    <li key={c.id}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13px] font-semibold text-ink">{c.currency}</span>
                        <span className={`text-[13px] font-semibold tabular-nums ${below ? "text-critical" : "text-ink"}`}>
                          {formatMoney(c.amount, c.currency)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                        <div
                          className={`h-full rounded-full ${below ? "bg-critical" : "bg-success"}`}
                          style={{
                            width: `${Math.min(100, c.threshold > 0 ? (c.amount / c.threshold) * 100 : 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Threshold {formatMoney(c.threshold, c.currency)}
                        {below ? " — below threshold" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Cameras */}
          <section className="rounded-lg border border-line bg-card p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Cameras ({cameras.length})
            </h2>
            {cameras.length === 0 ? (
              <EmptyState title="No cameras" message="No cameras registered at this branch." />
            ) : (
              <ul className="space-y-2">
                {cameras.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/cameras/${c.id}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface"
                    >
                      <span className="truncate text-[13px] font-medium text-ink">
                        {c.name}
                      </span>
                      <CameraStatusBadge status={c.status} />
                    </Link>
                    <p className="px-2 text-[11px] text-muted">
                      Last seen {timeAgo(c.last_seen_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
