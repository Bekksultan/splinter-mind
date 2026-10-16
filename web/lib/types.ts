/**
 * Web domain types — single source of truth is `@splinter-mind/core`.
 * Re-export shared contracts; add only web-specific helpers here.
 */
export * from "@splinter-mind/core";

import type { AlertNote } from "@splinter-mind/core";

/**
 * Alert note with the author's display name attached client-side.
 * (The alert_notes table has no user_name column; queries join it from users.)
 */
export interface AlertNoteWithAuthor extends AlertNote {
  user_name: string | null;
}

/** UI timeline entry (branch detail, alert detail, camera detail). */
export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  kind: "event" | "alert" | "note" | "audit" | "shift";
  severity?: import("@splinter-mind/core").Severity;
}
