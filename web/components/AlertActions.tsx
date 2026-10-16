"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Alert, OrgUser } from "@splinter-mind/core";
import {
  addAlertNote,
  assignAlert,
  runAlertAction,
  type AlertAction,
} from "@/lib/mutations";

const buttonBase =
  "rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50";

export function AlertActions({
  alert,
  users,
}: {
  alert: Alert;
  users: OrgUser[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<AlertAction | "assign" | "note" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState(alert.assigned_to ?? "");

  async function handleAction(action: AlertAction, note?: string) {
    setPending(action);
    setError(null);
    try {
      await runAlertAction(alert.id, action, note);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  async function handleAssign() {
    if (!assignee) return;
    setPending("assign");
    setError(null);
    try {
      await assignAlert(alert.id, assignee);
      setAssignOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setPending(null);
    }
  }

  async function handleAddNote() {
    if (noteText.trim().length === 0) return;
    setPending("note");
    setError(null);
    try {
      await addAlertNote(alert.id, alert.organization_id, noteText.trim());
      setNoteText("");
      setNoteOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add note");
    } finally {
      setPending(null);
    }
  }

  const terminal = alert.status === "resolved" || alert.status === "ignored";

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Actions
      </h2>
      {error ? (
        <p className="mb-3 rounded-md bg-critical/10 px-3 py-2 text-[13px] text-critical">
          {error}
        </p>
      ) : null}

      {!terminal ? (
        <div className="flex flex-wrap gap-2">
          {alert.status === "open" ? (
            <button
              onClick={() => handleAction("acknowledge")}
              disabled={pending !== null}
              className={`${buttonBase} bg-medium text-white hover:bg-medium/90`}
            >
              {pending === "acknowledge" ? "Working…" : "Acknowledge"}
            </button>
          ) : null}
          <button
            onClick={() => handleAction("resolve")}
            disabled={pending !== null}
            className={`${buttonBase} bg-success text-white hover:bg-success/90`}
          >
            {pending === "resolve" ? "Working…" : "Resolve"}
          </button>
          <button
            onClick={() => handleAction("ignore")}
            disabled={pending !== null}
            className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}
          >
            {pending === "ignore" ? "Working…" : "Ignore"}
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">
          This alert is {alert.status}. Terminal states cannot be changed —
          new events will raise new alerts.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setAssignOpen((v) => !v)}
          className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}
        >
          Assign
        </button>
        <button
          onClick={() => setNoteOpen((v) => !v)}
          className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}
        >
          Add note
        </button>
      </div>

      {assignOpen ? (
        <div className="mt-3 border-t border-line pt-3">
          <label className="mb-1 block text-xs font-semibold text-ink-soft">
            Assign to
          </label>
          <div className="flex gap-2">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Select team member…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={!assignee || pending !== null}
              className={`${buttonBase} bg-ink text-white hover:bg-ink-soft`}
            >
              {pending === "assign" ? "…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      {noteOpen ? (
        <div className="mt-3 border-t border-line pt-3">
          <label className="mb-1 block text-xs font-semibold text-ink-soft">
            Note
          </label>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="What did you find? What should happen next?"
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-muted"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setNoteOpen(false)}
              className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}
            >
              Cancel
            </button>
            <button
              onClick={handleAddNote}
              disabled={noteText.trim().length === 0 || pending !== null}
              className={`${buttonBase} bg-ink text-white hover:bg-ink-soft`}
            >
              {pending === "note" ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
