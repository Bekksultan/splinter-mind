import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import {
  getAlert,
  getAlertNotes,
  getBranches,
  getEvent,
  getUsers,
} from "@/lib/queries";
import { AlertActions } from "@/components/AlertActions";
import { AiAnalysisCard, SnapshotViewer } from "@/components/Evidence";
import { SeverityBadge } from "@/components/SeverityBadge";
import { AlertStatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { PageHeader, SectionTitle } from "@/components/Layout";
import { AlertsRealtime } from "@/components/Realtime";
import { formatDateTime, humanize, timeAgo } from "@/lib/format";
import type { TimelineItem } from "@/lib/types";

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  const alert = await getAlert(supabase, id);
  if (!alert) notFound();

  const [notes, users, branches, event] = await Promise.all([
    getAlertNotes(supabase, alert.id),
    getUsers(supabase),
    getBranches(supabase),
    alert.event_id ? getEvent(supabase, alert.event_id) : null,
  ]);

  const branch = branches.find((b) => b.id === alert.branch_id);
  const assignee = users.find((u) => u.id === alert.assigned_to);

  const timeline: TimelineItem[] = [
    {
      id: `${alert.id}-created`,
      time: alert.created_at,
      title: "Alert created",
      description: alert.title,
      kind: "alert",
      severity: alert.severity,
    },
    ...notes.map((n) => ({
      id: `note-${n.id}`,
      time: n.created_at,
      title: n.user_name ? `Note by ${n.user_name}` : "Note added",
      description: n.note,
      kind: "note" as const,
    })),
  ];
  if (alert.acknowledged_at) {
    timeline.push({
      id: `${alert.id}-ack`,
      time: alert.acknowledged_at,
      title: "Acknowledged",
      kind: "audit",
    });
  }
  if (alert.resolved_at) {
    timeline.push({
      id: `${alert.id}-res`,
      time: alert.resolved_at,
      title: "Resolved",
      kind: "audit",
    });
  }
  timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <div>
      <AlertsRealtime />
      <PageHeader
        kicker="Alert"
        title={alert.title}
        actions={
          <Link
            href="/alerts"
            className="rounded-md border border-line px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:bg-card"
          >
            ← All alerts
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Header card */}
          <div className="rounded-lg border border-line bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <AlertStatusBadge status={alert.status} />
              <span className="ml-auto text-xs text-muted" title={formatDateTime(alert.created_at)}>
                {timeAgo(alert.created_at)}
              </span>
            </div>
            {alert.description ? (
              <p className="mt-3 text-[14px] leading-6 text-ink-soft">
                {alert.description}
              </p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
              <div>
                <dt className="text-muted">Branch</dt>
                <dd className="font-medium text-ink">
                  {branch ? (
                    <Link href={`/branches/${branch.id}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">
                      {branch.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Assigned to</dt>
                <dd className="font-medium text-ink">{assignee?.name ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-muted">Created</dt>
                <dd className="font-medium text-ink">{formatDateTime(alert.created_at)}</dd>
              </div>
              <div>
                <dt className="text-muted">Event</dt>
                <dd className="font-medium text-ink">
                  {event ? humanize(event.event_type) : "—"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Evidence */}
          <div>
            <SectionTitle>Evidence</SectionTitle>
            <SnapshotViewer
              cameraId={event?.camera_id ?? null}
              initialUrl={event?.snapshot_url ?? null}
            />
            {event?.ai_analysis ? (
              <div className="mt-4">
                <SectionTitle>AI analysis</SectionTitle>
                <AiAnalysisCard analysis={event.ai_analysis} />
              </div>
            ) : null}
          </div>

          {/* Timeline */}
          <div>
            <SectionTitle>Timeline</SectionTitle>
            <Timeline items={timeline} />
          </div>
        </div>

        <div className="space-y-6">
          <AlertActions alert={alert} users={users} />
          {notes.length > 0 ? (
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                Notes ({notes.length})
              </h2>
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                    <p className="text-[13px] text-ink">{n.note}</p>
                    <p className="mt-1 text-xs text-muted">
                      {n.user_name ?? "Unknown"} · {timeAgo(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
