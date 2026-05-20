// Auth hook — wraps Supabase auth with our store

import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';

export function useAuth() {
  const { session, profile, isLoading, setSession, setProfile, setLoading } = useAuthStore();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  }

  async function signUp(email: string, password: string): Promise<{ requiresConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // If session is immediately returned, email confirmation is disabled
    return { requiresConfirmation: !data.session };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    useAuthStore.getState().signOut();
  }

  async function deleteAccount() {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) throw error;
    await signOut();
  }

  return {
    session,
    profile,
    isLoading,
    isAuthenticated: !!session,
    signUp,
    signIn,
    signOut,
    deleteAccount,
    refreshProfile: () => session?.user && fetchProfile(session.user.id),
  };
}
