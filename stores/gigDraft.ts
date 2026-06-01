// Zustand store for the gig creation wizard
// Persists draft state so users don't lose progress

import { create } from 'zustand';

export interface GigDraft {
  // Step 1: Locations
  from_address: string;
  from_lat: number | null;
  from_lng: number | null;
  from_zip: string | null;
  to_address: string;
  to_lat: number | null;
  to_lng: number | null;
  to_zip: string | null;
  distance_miles: number | null;

  // Step 2: Size — kept in sync with the intake form's size options
  home_size: 'few-items' | 'studio' | '1br' | '2br' | '3br+' | '4br' | 'other';

  // Step 3: Inventory
  rooms: Record<string, number>;
  heavy_items: string[];
  photos: { uri: string; label: string }[];
  has_fragile_items: boolean;

  // Step 4: Crew + truck
  crew_size: number;
  truck_size: 'none' | 'small' | 'medium' | 'large';

  // Step 5: Access
  stairs_from: number;
  stairs_to: number;
  elevator_from: boolean;
  elevator_to: boolean;
  long_carry: boolean;
  staging: boolean;
  packing_service: boolean;

  // Step 6: Schedule
  scheduled_for: string | null; // null = ASAP

  // Step 7: Contact
  contact_first_name: string;
  contact_last_name: string;
  contact_phone: string;
  contact_email: string;
  customer_notes: string;
  pickup_notes: string;
  dropoff_notes: string;
  specialty_item: string | null;
  item_dimensions: 'small' | 'medium' | 'large' | null;
  item_condition: 'standard' | 'fragile' | 'valuable' | 'antique' | null;
  item_weight: 'light' | 'heavy' | null;
  disassembly_needed: boolean;
  white_glove: boolean;
  packing_required: boolean;
  item_description: string;

  // Category + voice-parsed fields
  gig_category: 'moving' | 'cleaning' | 'landscaping' | 'auto' | 'organizing' | 'can-to-curb' | 'junk-removal';
  gig_title: string;
  gig_description: string;
}

interface GigDraftStore {
  draft: GigDraft;
  currentStep: number;
  setStep: (step: number) => void;
  updateDraft: (updates: Partial<GigDraft>) => void;
  resetDraft: () => void;
}

const INITIAL_DRAFT: GigDraft = {
  from_address: '',
  from_lat: null,
  from_lng: null,
  from_zip: null,
  to_address: '',
  to_lat: null,
  to_lng: null,
  to_zip: null,
  distance_miles: null,
  home_size: 'studio',
  rooms: { bedroom: 1, living: 1, kitchen: 1, bath: 1 },
  heavy_items: [],
  photos: [],
  has_fragile_items: false,
  crew_size: 2,
  truck_size: 'medium',
  stairs_from: 0,
  stairs_to: 2,
  elevator_from: false,
  elevator_to: false,
  long_carry: false,
  staging: false,
  packing_service: false,
  scheduled_for: null,
  contact_first_name: '',
  contact_last_name: '',
  contact_phone: '',
  contact_email: '',
  customer_notes: '',
  pickup_notes: '',
  dropoff_notes: '',
  specialty_item: null,
  item_dimensions: null,
  item_condition: null,
  item_weight: null,
  disassembly_needed: false,
  white_glove: false,
  packing_required: false,
  item_description: '',
  gig_category: 'moving',
  gig_title: '',
  gig_description: '',
};

export const useGigDraftStore = create<GigDraftStore>((set) => ({
  draft: INITIAL_DRAFT,
  currentStep: 0,
  setStep: (step) => set({ currentStep: step }),
  updateDraft: (updates) =>
    set((state) => ({ draft: { ...state.draft, ...updates } })),
  resetDraft: () => set({ draft: INITIAL_DRAFT, currentStep: 0 }),
}));
