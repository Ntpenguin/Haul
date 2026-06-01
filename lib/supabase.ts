// Supabase client setup
// Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Secure storage adapter for auth tokens
const SecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Type exports for database — update these when you generate types from Supabase
export type Database = {
  // TODO: Generate with `npx supabase gen types typescript` after migrations
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      mover_profiles: { Row: MoverProfile; Insert: Partial<MoverProfile>; Update: Partial<MoverProfile> };
      gigs: { Row: Gig; Insert: Partial<Gig>; Update: Partial<Gig> };
      gig_photos: { Row: GigPhoto; Insert: Partial<GigPhoto>; Update: Partial<GigPhoto> };
      gig_applications: { Row: GigApplication; Insert: Partial<GigApplication>; Update: Partial<GigApplication> };
      payments: { Row: Payment; Insert: Partial<Payment>; Update: Partial<Payment> };
      reviews: { Row: Review; Insert: Partial<Review>; Update: Partial<Review> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
    };
  };
};

// Row types matching the schema from the spec
export interface Profile {
  id: string;
  role: 'customer' | 'mover' | 'both';
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  rating: number | null;
  total_gigs: number;
  category_colors: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface MoverProfile {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  vehicle_type: string | null;
  vehicle_make_model: string | null;
  license_doc_url: string | null;
  insurance_doc_url: string | null;
  background_check_status: string;
  background_check_id: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  service_area_zip: string[];
  bio: string | null;
  selfie_url: string | null;
  years_experience: number | null;
  skills: string[];
  address: string | null;
  account_type: 'independent' | 'business' | null;
  business_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Gig {
  id: string;
  customer_id: string | null;
  quote_request_id: string | null;
  status: 'draft' | 'posted' | 'matched' | 'in_progress' | 'completed' | 'cancelled';
  from_address: string;
  from_lat: number | null;
  from_lng: number | null;
  from_zip: string | null;
  to_address: string;
  to_lat: number | null;
  to_lng: number | null;
  to_zip: string | null;
  distance_miles: number | null;
  home_size: string | null;
  rooms: Record<string, number> | null;
  heavy_items: string[];
  crew_size: number | null;
  truck_size: string | null;
  stairs_from: number;
  stairs_to: number;
  elevator_from: boolean;
  elevator_to: boolean;
  long_carry: boolean;
  staging: boolean;
  packing_service: boolean;
  has_fragile_items: boolean;
  scheduled_for: string | null;
  estimated_duration_hours: number | null;
  pricing_model: 'flat' | 'hourly';
  quoted_price_cents: number | null;
  final_price_cents: number | null;
  hourly_rate_cents: number | null;
  customer_notes: string | null;
  gig_category: string;
  gig_title: string | null;
  gig_description: string | null;
  mover_id: string | null;
  matched_at: string | null;
  completed_at: string | null;
  platform_fee_cents: number | null;
  mover_payout_cents: number | null;
  payout_status: 'unpaid' | 'pending' | 'paid' | 'failed';
  stripe_transfer_id: string | null;
  paid_at: string | null;
  payout_at: string | null;
  draft_step: string | null;
  created_at: string;
  updated_at: string;
}

export interface GigPhoto {
  id: string;
  gig_id: string;
  url: string;
  label: string | null;
  phase: 'inspection' | 'loading' | 'dropoff' | 'item' | null;
  position: number | null;
  created_at: string;
}

export interface GigApplication {
  id: string;
  gig_id: string;
  mover_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  quoted_price_cents: number | null;
  message: string | null;
  slots_claimed: number;
  is_lead: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  gig_id: string;
  customer_id: string;
  mover_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  tip_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  status: 'pending' | 'authorized' | 'captured' | 'refunded' | 'failed';
  captured_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  gig_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, any>;
  read_at: string | null;
  sent_via: string[];
  created_at: string;
}
