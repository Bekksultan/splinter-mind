"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { AlertStatus, Branch, Severity } from "@splinter-mind/core";
import { ALERT_STATUSES, SEVERITIES } from "@splinter-mind/core";

const selectClass =
  "rounded-md border border-line bg-white px-3 py-2 text-[13px] text-ink";

export function AlertFilters({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") ?? "") as AlertStatus | "";
  const severity = (params.get("severity") ?? "") as Severity | "";
  const branchId = params.get("branch") ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `/alerts?${qs}` : "/alerts");
  }

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <select
        aria-label="Status filter"
        value={status}
        onChange={(e) => setParam("status", e.target.value)}
        className={selectClass}
      >
        <option value="">All statuses</option>
        {ALERT_STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
      <select
        aria-label="Severity filter"
        value={severity}
        onChange={(e) => setParam("severity", e.target.value)}
        className={selectClass}
      >
        <option value="">All severities</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
      <select
        aria-label="Branch filter"
        value={branchId}
        onChange={(e) => setParam("branch", e.target.value)}
        className={selectClass}
      >
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {status || severity || branchId ? (
        <button
          onClick={() => router.push("/alerts")}
          className="rounded-md border border-line px-3 py-2 text-[13px] font-medium text-ink-soft hover:bg-card"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
