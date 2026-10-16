import type { Severity } from "@splinter-mind/core";

const STYLES: Record<Severity, string> = {
  critical: "bg-critical/10 text-critical border-critical/30",
  high: "bg-high/10 text-high border-high/30",
  medium: "bg-medium/10 text-medium border-medium/30",
  low: "bg-low/10 text-low border-low/30",
  info: "bg-neutral/10 text-neutral border-neutral/30",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}
