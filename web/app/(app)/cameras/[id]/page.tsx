import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { getAlerts, getBranch, getCamera, getEvents } from "@/lib/queries";
import { AlertCard } from "@/components/Cards";
import { SnapshotViewer } from "@/components/Evidence";
import { AlertsRealtime, EventsRealtime } from "@/components/Realtime";
import { Timeline } from "@/components/Timeline";
import { PageHeader, SectionTitle } from "@/components/Layout";
import { CameraStatusBadge } from "@/components/StatusBadge";
import { formatDateTime, humanize, timeAgo } from "@/lib/format";
import type { TimelineItem } from "@/lib/types";

export default async function CameraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  const camera = await getCamera(supabase, id);
  if (!camera) notFound();

  const [branch, events, openAlerts] = await Promise.all([
    getBranch(supabase, camera.branch_id),
    getEvents(supabase, { cameraId: camera.id, limit: 30 }),
    getAlerts(supabase, { status: "open", limit: 200 }),
  ]);
  const cameraAlerts = openAlerts.filter((a) => a.event_id && events.some((e) => e.id === a.event_id));

  const latestEvent = events[0] ?? null;
  const timeline: TimelineItem[] = events.map((e) => ({
    id: e.id,
    time: e.timestamp,
    title: humanize(e.event_type),
    description:
      typeof e.raw_payload?.message === "string" ? e.raw_payload.message : undefined,
    kind: "event" as const,
    severity: e.severity,
  }));

  return (
    <div>
      <AlertsRealtime />
      <EventsRealtime />
      <PageHeader
        kicker="Camera"
        title={camera.name}
        actions={
          branch ? (
            <Link
              href={`/branches/${branch.id}`}
              className="rounded-md border border-line px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:bg-card"
            >
              ← {branch.name}
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <SectionTitle>Latest snapshot</SectionTitle>
            <SnapshotViewer
              cameraId={camera.id}
              initialUrl={latestEvent?.snapshot_url ?? null}
            />
          </section>

          {cameraAlerts.length > 0 ? (
            <section>
              <SectionTitle>Open alerts</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {cameraAlerts.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionTitle>Event timeline</SectionTitle>
            <Timeline items={timeline} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-card p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Status
            </h2>
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">State</span>
                <CameraStatusBadge status={camera.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Last seen</span>
                <span className="font-medium text-ink" title={formatDateTime(camera.last_seen_at)}>
                  {timeAgo(camera.last_seen_at)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Provider</span>
                <span className="font-medium capitalize text-ink">{camera.provider}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Type</span>
                <span className="font-medium capitalize text-ink">
                  {camera.camera_type ? humanize(camera.camera_type) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">External ID</span>
                <span className="font-mono text-xs text-ink">{camera.external_id ?? "—"}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
