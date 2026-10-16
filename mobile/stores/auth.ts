import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { User } from '../types';
import {
  getDemoUser,
  setDemoOverride as setDemoLibOverride,
  shouldUseDemo,
} from '../lib/demo';
import { getSupabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  profile: User | null;
  loading: boolean;
  /** Runtime demo override (null = follow env/Supabase config). */
  demoOverride: boolean | null;
  /** Load session + profile (or demo profile in demo mode). Called once on mount. */
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Skip login and enter the app with the demo coordinator profile. */
  enterDemo: () => void;
  setDemoOverride: (v: boolean | null) => void;
  currentUserId: () => string | null;
}

async function loadProfile(session: Session | null): Promise<User | null> {
  if (!session) return null;
  const supabase = getSupabase();
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();
  return (data ?? null) as User | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  demoOverride: null,

  init: async () => {
    set({ loading: true });
    try {
      if (shouldUseDemo()) {
        set({ session: null, profile: getDemoUser(), loading: false });
        return;
      }
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const profile = await loadProfile(session);
      set({ session, profile, loading: false });
    } catch {
      set({ session: null, profile: null, loading: false });
    }
  },

  signIn: async (email, password) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    const session = data.session;
    const profile = await loadProfile(session);
    set({ session, profile });
  },

  signOut: async () => {
    try {
      await getSupabase().auth.signOut();
    } catch {
      // Already signed out or offline — clear local state regardless.
    }
    set({ session: null, profile: null });
  },

  enterDemo: () => {
    setDemoLibOverride(true);
    set({ demoOverride: true, session: null, profile: getDemoUser() });
  },

  setDemoOverride: (v) => {
    setDemoLibOverride(v);
    set({ demoOverride: v });
  },

  currentUserId: () => {
    const { session, profile } = get();
    return profile?.id ?? session?.user.id ?? null;
  },
}));
