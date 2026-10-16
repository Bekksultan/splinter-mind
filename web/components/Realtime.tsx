"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres changes on the alerts table (RLS-filtered to the
 * user's organization) and refreshes server-rendered data on any insert or
 * update. Mount once per page that shows alert data.
 */
export function AlertsRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("web-alerts-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}

/**
 * Same for the events table (branch/camera timelines).
 */
export function EventsRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("web-events-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
