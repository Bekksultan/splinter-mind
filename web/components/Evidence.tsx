"use client";

import { useState } from "react";
import { isVisionAnalysis, type VisionAnalysis } from "@splinter-mind/core";
import type { AiAnalysis } from "@splinter-mind/core";
import { fetchSnapshot } from "@/lib/mutations";
import { formatConfidence } from "@/lib/format";
import { SeverityBadge } from "./SeverityBadge";

const ROWS: Array<[keyof VisionAnalysis, string]> = [
  ["person_detected", "Person detected"],
  ["restricted_area", "Restricted area"],
  ["outside_working_hours", "Outside working hours"],
];

export function AiAnalysisCard({ analysis }: { analysis: AiAnalysis }) {
  if (!isVisionAnalysis(analysis)) {
    return (
      <div className="rounded-lg border border-line bg-card p-4">
        <p className="text-[13px] text-muted">
          The vision service was unavailable when this event was processed. The
          event is stored — AI analysis can be retried from the backend.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      {analysis.summary ? (
        <p className="mb-3 text-[13.5px] leading-5 text-ink">{analysis.summary}</p>
      ) : null}
      <dl>
        {ROWS.map(([key, label]) => (
          <div
            key={key}
            className="flex items-center justify-between border-t border-line py-2"
          >
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="text-[13px] font-semibold text-ink">
              {analysis[key] ? "Yes" : "No"}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line py-2">
          <dt className="text-[13px] text-muted">Confidence</dt>
          <dd className="text-[13px] font-semibold text-ink">
            {formatConfidence(analysis.confidence)}
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-line py-2">
          <dt className="text-[13px] text-muted">Risk level</dt>
          <dd>
            <SeverityBadge severity={analysis.risk_level ?? "low"} />
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        AI advises only — the coordinator makes the final decision.
      </p>
    </div>
  );
}

export function SnapshotViewer({
  cameraId,
  initialUrl,
}: {
  cameraId: string | null;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!cameraId) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchSnapshot(cameraId);
      setUrl(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snapshot failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Camera snapshot"
          className="aspect-video w-full rounded-lg border border-line bg-ink object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface">
          <p className="text-[13px] text-muted">No snapshot available</p>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={refresh}
          disabled={!cameraId || loading}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface disabled:opacity-50"
        >
          {loading ? "Capturing…" : "Refresh snapshot"}
        </button>
        {error ? <span className="text-xs text-critical">{error}</span> : null}
      </div>
    </div>
  );
}
