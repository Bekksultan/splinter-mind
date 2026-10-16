import type { TimelineItem } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { SeverityBadge } from "./SeverityBadge";

const KIND_LABEL: Record<TimelineItem["kind"], string> = {
  event: "Event",
  alert: "Alert",
  note: "Note",
  audit: "Audit",
  shift: "Shift",
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted">
        No timeline entries yet.
      </p>
    );
  }
  return (
    <ol className="relative space-y-0 border-l-2 border-line pl-0">
      {items.map((item) => (
        <li key={item.id} className="relative pb-5 pl-6 last:pb-0">
          <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-card bg-neutral" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {KIND_LABEL[item.kind]}
            </span>
            {item.severity ? <SeverityBadge severity={item.severity} /> : null}
            <span className="text-xs text-muted" title={item.time}>
              {formatDateTime(item.time)}
            </span>
          </div>
          <p className="mt-1 text-[13.5px] font-medium text-ink">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 text-[13px] text-ink-soft">{item.description}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
