import Link from "next/link";
import { Suspense } from "react";
import { getServerClient } from "@/lib/supabase/server";
import { getBranches, getEvents } from "@/lib/queries";
import { EventFilters } from "@/components/EventFilters";
import { EventsRealtime } from "@/components/Realtime";
import { EmptyState, PageHeader } from "@/components/Layout";
import { SeverityBadge } from "@/components/SeverityBadge";
import { formatDateTime, humanize, timeAgo } from "@/lib/format";
import { EVENT_TYPES } from "@splinter-mind/core";

function isEventType(v: string | undefined): boolean {
  return !!v && (EVENT_TYPES as readonly string[]).includes(v);
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; type?: string }>;
}) {
  const supabase = await getServerClient();
  const params = await searchParams;
  const [events, branches] = await Promise.all([
    getEvents(supabase, {
      branchId: params.branch || undefined,
      eventType: isEventType(params.type) ? params.type : undefined,
      limit: 150,
    }),
    getBranches(supabase),
  ]);
  const branchNames = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div>
      <EventsRealtime />
      <PageHeader kicker="Operations" title="Events" />
      <Suspense>
        <EventFilters branches={branches} />
      </Suspense>
      {events.length === 0 ? (
        <EmptyState
          title="No events"
          message="Events will appear here as cameras and rules report them."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <table className="table-dense w-full">
            <thead>
              <tr>
                <th>Event</th>
                <th>Branch</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium text-ink">
                    {e.camera_id ? (
                      <Link
                        href={`/cameras/${e.camera_id}`}
                        className="underline decoration-line underline-offset-2 hover:decoration-ink"
                      >
                        {humanize(e.event_type)}
                      </Link>
                    ) : (
                      humanize(e.event_type)
                    )}
                  </td>
                  <td className="text-ink-soft">
                    {branchNames.get(e.branch_id) ?? "—"}
                  </td>
                  <td>
                    <SeverityBadge severity={e.severity} />
                  </td>
                  <td className="capitalize text-ink-soft">{e.source}</td>
                  <td
                    className="whitespace-nowrap text-muted"
                    title={formatDateTime(e.timestamp)}
                  >
                    {timeAgo(e.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
