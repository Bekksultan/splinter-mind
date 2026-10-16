import { Suspense } from "react";
import { getServerClient } from "@/lib/supabase/server";
import { getAlerts, getBranches } from "@/lib/queries";
import { AlertCard } from "@/components/Cards";
import { AlertFilters } from "@/components/AlertFilters";
import { AlertsRealtime } from "@/components/Realtime";
import { EmptyState, PageHeader } from "@/components/Layout";
import {
  ALERT_STATUSES,
  SEVERITIES,
  type AlertStatus,
  type Severity,
} from "@splinter-mind/core";

function isAlertStatus(v: string | undefined): v is AlertStatus {
  return !!v && (ALERT_STATUSES as readonly string[]).includes(v);
}

function isSeverity(v: string | undefined): v is Severity {
  return !!v && (SEVERITIES as readonly string[]).includes(v);
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; branch?: string }>;
}) {
  const supabase = await getServerClient();
  const params = await searchParams;
  const [alerts, branches] = await Promise.all([
    getAlerts(supabase, {
      status: isAlertStatus(params.status) ? params.status : undefined,
      severity: isSeverity(params.severity) ? params.severity : undefined,
      branchId: params.branch || undefined,
      limit: 200,
    }),
    getBranches(supabase),
  ]);

  return (
    <div>
      <AlertsRealtime />
      <PageHeader kicker="Operations" title="Alerts" />
      <Suspense>
        <AlertFilters branches={branches} />
      </Suspense>
      {alerts.length === 0 ? (
        <EmptyState
          title="No alerts match"
          message="Try widening the filters, or wait for new events to be processed."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
