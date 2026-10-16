import type {
  Severity,
  WeekdayKey,
  WorkingHours,
} from "@splinter-mind/core";

/** "camera_offline" -> "Camera offline" */
export function humanize(value: string): string {
  return value
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** "3m ago", "2h ago", "just now" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DAY_ORDER: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** "Mon–Fri 09:00–21:00" — groups consecutive days sharing the same hours. */
export function formatWorkingHours(workingHours: WorkingHours | null): string {
  if (!workingHours) return "Not set";
  const rangeFor = (day: WeekdayKey): string | null => {
    const entry = workingHours[day];
    if (!entry || entry.closed || !entry.open || !entry.close) return null;
    return `${entry.open}–${entry.close}`;
  };
  const groups: Array<{ days: WeekdayKey[]; range: string }> = [];
  for (const day of DAY_ORDER) {
    const range = rangeFor(day);
    if (!range) continue;
    const last = groups[groups.length - 1];
    const prevDay = last ? last.days[last.days.length - 1] : null;
    const consecutive =
      prevDay !== null && DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(prevDay) + 1;
    if (last && last.range === range && consecutive) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], range });
    }
  }
  if (groups.length === 0) return "Closed";
  return groups
    .map((g) => {
      const label =
        g.days.length === 1
          ? DAY_LABEL[g.days[0]]
          : `${DAY_LABEL[g.days[0]]}–${DAY_LABEL[g.days[g.days.length - 1]]}`;
      return `${label} ${g.range}`;
    })
    .join(" · ");
}

export function formatConfidence(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  const pct = value > 1 ? value : value * 100;
  return `${Math.round(pct)}%`;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/** Sort severities most-severe-first using the shared SEVERITY_RANK. */
export function sortSeverities(severities: Severity[]): Severity[] {
  const rank: Record<Severity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };
  return [...severities].sort((a, b) => rank[b] - rank[a]);
}
