// Zod schemas for form validation

import { z } from 'zod';

// Phone: E.164 format
export const phoneSchema = z.string()
  .transform(val => val.replace(/[^\d+]/g, ''))
  .refine(val => /^\+?1?\d{10,14}$/.test(val), 'Invalid phone number');

// Format to E.164 before sending to Supabase Auth
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export const profileSchema = z.object({
  full_name: z.string().min(2, 'Name is required'),
  phone: phoneSchema,
  email: z.string().email().optional().or(z.literal('')),
});

export const gigDraftSchema = z.object({
  from_address: z.string().min(3, 'Pickup address required'),
  to_address: z.string().min(3, 'Drop-off address required'),
  home_size: z.enum(['item', 'studio', '1br', '2br', '3br+']),
  crew_size: z.number().min(1).max(6),
  truck_size: z.enum(['none', 'small', 'medium', 'large']),
  stairs_from: z.number().min(0),
  stairs_to: z.number().min(0),
  elevator_from: z.boolean(),
  elevator_to: z.boolean(),
  long_carry: z.boolean(),
  has_fragile_items: z.boolean(),
  heavy_items: z.array(z.string()),
  rooms: z.record(z.string(), z.number()),
  scheduled_for: z.string().nullable(),
  customer_notes: z.string().optional(),
});

export const gigApplicationSchema = z.object({
  gig_id: z.string().uuid(),
  quoted_price_cents: z.number().positive().optional(),
  message: z.string().max(500).optional(),
});

export const reviewSchema = z.object({
  gig_id: z.string().uuid(),
  reviewee_id: z.string().uuid(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
