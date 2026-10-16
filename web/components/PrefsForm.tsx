"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationPref, Severity } from "@splinter-mind/core";
import { SEVERITIES } from "@splinter-mind/core";
import { updateNotificationPrefs } from "@/lib/mutations";

export function PrefsForm({
  userId,
  initial,
}: {
  userId: string;
  initial: NotificationPref | null;
}) {
  const router = useRouter();
  const [pushEnabled, setPushEnabled] = useState(initial?.push_enabled ?? true);
  const [severities, setSeverities] = useState<Severity[]>(
    (initial?.severities as Severity[] | undefined) ?? [
      "critical",
      "high",
      "medium",
      "low",
    ]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Track A (WhatsApp) adds these columns in migration 0003. The DB may not
  // be migrated yet — render the section only when the backend returns them.
  const whatsappSupported =
    initial !== null && "whatsapp_enabled" in initial;
  const [whatsappEnabled, setWhatsappEnabled] = useState(
    whatsappSupported ? Boolean(initial.whatsapp_enabled) : false
  );
  const [whatsappNumber, setWhatsappNumber] = useState(
    whatsappSupported ? (initial.whatsapp_number ?? "") : ""
  );

  function toggleSeverity(sev: Severity) {
    setSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateNotificationPrefs(userId, {
        push_enabled: pushEnabled,
        severities,
        ...(whatsappSupported
          ? {
              whatsapp_enabled: whatsappEnabled,
              whatsapp_number: whatsappNumber.trim() || null,
            }
          : {}),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error ? (
        <p className="rounded-md bg-critical/10 px-3 py-2 text-[13px] text-critical">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-[13px] text-success">
          Preferences saved.
        </p>
      ) : null}

      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">
          Push notifications
        </h2>
        <p className="mb-4 text-[13px] text-muted">
          Critical alerts always bypass quiet hours.
        </p>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => setPushEnabled(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          <span className="text-[13.5px] font-medium text-ink">
            Enable push notifications on this account
          </span>
        </label>
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
            Notify me about
          </p>
          <div className="flex flex-wrap gap-2">
            {SEVERITIES.map((sev) => (
              <button
                key={sev}
                onClick={() => toggleSeverity(sev)}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors ${
                  severities.includes(sev)
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-ink-soft hover:bg-surface"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </section>

      {whatsappSupported ? (
        <section className="rounded-lg border border-line bg-card p-5">
          <h2 className="mb-1 text-[15px] font-semibold text-ink">WhatsApp</h2>
          <p className="mb-4 text-[13px] text-muted">
            Optional secondary channel for important alerts. The mobile app
            remains the primary interface.
          </p>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <span className="text-[13.5px] font-medium text-ink">
              Send WhatsApp notifications
            </span>
          </label>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold text-ink-soft">
              WhatsApp number (international format)
            </label>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+996 555 000 000"
              className="w-full max-w-xs rounded-md border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-muted"
            />
          </div>
        </section>
      ) : null}

      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink-soft disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save preferences"}
      </button>
    </div>
  );
}
