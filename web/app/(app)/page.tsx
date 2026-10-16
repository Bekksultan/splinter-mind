import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { getDashboardSummary, getOrganization, getProfile } from "@/lib/queries";
import { AlertCard } from "@/components/Cards";
import { AlertsRealtime } from "@/components/Realtime";
import { EmptyState, PageHeader } from "@/components/Layout";
import type { Severity } from "@splinter-mind/core";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "text-critical",
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
  info: "text-neutral",
};

export default async function DashboardPage() {
  const supabase = await getServerClient();
  const profile = await getProfile(supabase);
  const [summary, organization] = await Promise.all([
    getDashboardSummary(supabase),
    profile ? getOrganization(supabase, profile.organization_id) : null,
  ]);

  const { criticalAlerts, warningAlerts, recentAlerts } = summary;
  const hasAttention = criticalAlerts.length > 0 || warningAlerts.length > 0;

  return (
    <div>
      <AlertsRealtime />
      <PageHeader
        kicker="Operations"
        title={organization?.name ?? "Dashboard"}
        actions={
          <Link
            href="/alerts?status=open"
            className="rounded-md border border-line px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-card"
          >
            View all open alerts
          </Link>
        }
      />

      {/* Summary strip */}
      <div className="mb-8 rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-3xl font-extrabold text-ink">
              {summary.branchCount}
            </p>
            <p className="text-[13px] text-muted">branches operational</p>
          </div>
          <div className="flex gap-8">
            {SEVERITY_ORDER.map((sev) => (
              <Link key={sev} href={`/alerts?status=open&severity=${sev}`} className="text-center">
                <p className={`text-2xl font-extrabold ${SEVERITY_TEXT[sev]}`}>
                  {summary.openBySeverity[sev]}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  {sev}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {!hasAttention ? (
        <EmptyState
          title="All clear"
          message="No open critical or high-severity alerts. Everything is operating normally."
        />
      ) : null}

      {criticalAlerts.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-critical">
            Critical — needs attention now
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {criticalAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </section>
      ) : null}

      {warningAlerts.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-high">
            Warnings
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {warningAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Recent alerts
          </h2>
          <Link href="/alerts" className="text-[13px] font-medium text-ink-soft hover:text-ink">
            View all →
          </Link>
        </div>
        {recentAlerts.length === 0 ? (
          <EmptyState title="No alerts yet" message="Alerts will appear here as events are processed." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        Dashboard refreshes automatically when new alerts arrive.
      </p>
    </div>
  );
}
