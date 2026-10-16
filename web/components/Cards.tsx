import Link from "next/link";
import type { Alert, Branch } from "@splinter-mind/core";
import { SeverityBadge } from "./SeverityBadge";
import { AlertStatusBadge } from "./StatusBadge";
import { formatDateTime, timeAgo } from "@/lib/format";

export function AlertCard({ alert }: { alert: Alert }) {
  return (
    <Link
      href={`/alerts/${alert.id}`}
      className="block rounded-lg border border-line bg-card p-4 transition-colors hover:border-neutral/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
          </div>
          <h3 className="mt-2 truncate text-[15px] font-semibold text-ink">
            {alert.title}
          </h3>
          {alert.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">
              {alert.description}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-muted" title={formatDateTime(alert.created_at)}>
          {timeAgo(alert.created_at)}
        </span>
      </div>
    </Link>
  );
}

export function BranchCard({ branch, openAlerts }: { branch: Branch; openAlerts: number }) {
  return (
    <Link
      href={`/branches/${branch.id}`}
      className="block rounded-lg border border-line bg-card p-4 transition-colors hover:border-neutral/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{branch.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {branch.address ?? branch.timezone}
          </p>
        </div>
        {openAlerts > 0 ? (
          <span className="rounded-full bg-critical/10 px-2.5 py-0.5 text-xs font-bold text-critical">
            {openAlerts} open
          </span>
        ) : (
          <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-bold text-success">
            Clear
          </span>
        )}
      </div>
    </Link>
  );
}
