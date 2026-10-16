/**
 * Mobile domain types — single source of truth is `@splinter-mind/core`
 * (packages/core). This module re-exports the shared contracts and adds only
 * mobile-specific aliases and UI types. Do not re-declare domain shapes here.
 */
export * from '@splinter-mind/core';

// Readability aliases used across the mobile codebase.
export type {
  CameraStatus as CameraStatusType,
  CameraProviderName as CameraProviderType,
  OrgUser as User,
  CameraEvent as EventItem,
  NotificationPref as NotificationPrefs,
} from '@splinter-mind/core';

import type { AlertNote } from '@splinter-mind/core';

/** Dev/demo "simulate event" scenarios — matches POST /simulate. */
export type SimulateScenario =
  | 'camera_offline'
  | 'motion_after_hours'
  | 'suspicious'
  | 'rate_mismatch'
  | 'low_cash';

/**
 * Alert note with the author's display name attached client-side.
 * (The alert_notes table has no user_name column; services join it from users.)
 */
export interface AlertNoteWithAuthor extends AlertNote {
  user_name: string | null;
}

/**
 * Registered ISAPI device (NVR) — mirrors public.devices (migration 0004).
 * credentials_ref is a Vault secret id; the password never reaches the app.
 */
export interface Device {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string;
  provider: string;
  host: string;
  port: number;
  use_https: boolean;
  username: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

/** UI-only timeline entry (branch detail, alert detail, camera detail). */
export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  kind: 'event' | 'alert' | 'note' | 'audit' | 'shift';
  severity?: import('@splinter-mind/core').Severity;
}
