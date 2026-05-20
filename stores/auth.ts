// Auth state store

import { create } from 'zustand';
import type { Profile } from '../lib/supabase';

interface AuthStore {
  session: any | null;
  profile: Profile | null;
  isLoading: boolean;
  setSession: (session: any | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  profile: null,
  isLoading: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: () => set({ session: null, profile: null }),
}));
