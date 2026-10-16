import { create } from 'zustand';

interface SyncState {
  /** ISO timestamp of the last successful data fetch. */
  lastSync: string | null;
  /** Mark a sync as complete (sets lastSync to now). */
  touch: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  lastSync: null,
  touch: () => set({ lastSync: new Date().toISOString() }),
}));
