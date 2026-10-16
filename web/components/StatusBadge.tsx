import type { AlertStatus, CameraStatus, EntityStatus } from "@splinter-mind/core";

const ALERT_STYLES: Record<AlertStatus, string> = {
  open: "bg-critical/10 text-critical border-critical/30",
  acknowledged: "bg-medium/10 text-medium border-medium/30",
  resolved: "bg-success/10 text-success border-success/30",
  ignored: "bg-neutral/10 text-neutral border-neutral/30",
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${ALERT_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const ENTITY_STYLES: Record<EntityStatus, string> = {
  active: "bg-success/10 text-success border-success/30",
  inactive: "bg-neutral/10 text-neutral border-neutral/30",
  maintenance: "bg-medium/10 text-medium border-medium/30",
};

export function EntityStatusBadge({ status }: { status: EntityStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${ENTITY_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const CAMERA_STYLES: Record<CameraStatus, string> = {
  online: "bg-success/10 text-success border-success/30",
  offline: "bg-critical/10 text-critical border-critical/30",
  degraded: "bg-medium/10 text-medium border-medium/30",
  unknown: "bg-neutral/10 text-neutral border-neutral/30",
};

const CAMERA_DOT: Record<CameraStatus, string> = {
  online: "bg-success",
  offline: "bg-critical",
  degraded: "bg-medium",
  unknown: "bg-neutral",
};

export function CameraStatusBadge({ status }: { status: CameraStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${CAMERA_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${CAMERA_DOT[status]}`} />
      {status}
    </span>
  );
}
