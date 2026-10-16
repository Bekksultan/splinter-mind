"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Branch } from "@splinter-mind/core";
import { EVENT_TYPES } from "@splinter-mind/core";
import { humanize } from "@/lib/format";

const selectClass =
  "rounded-md border border-line bg-white px-3 py-2 text-[13px] text-ink";

export function EventFilters({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const branchId = params.get("branch") ?? "";
  const eventType = params.get("type") ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `/events?${qs}` : "/events");
  }

  return (
    <div className="mb-5 flex flex-wrap gap-2">
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
      <select
        aria-label="Event type filter"
        value={eventType}
        onChange={(e) => setParam("type", e.target.value)}
        className={selectClass}
      >
        <option value="">All event types</option>
        {EVENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {humanize(t)}
          </option>
        ))}
      </select>
      {branchId || eventType ? (
        <button
          onClick={() => router.push("/events")}
          className="rounded-md border border-line px-3 py-2 text-[13px] font-medium text-ink-soft hover:bg-card"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
