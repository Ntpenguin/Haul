// App-wide configuration
// Change these when expanding to new cities or adjusting business logic

export const APP_CONFIG = {
  // Geography — hardcoded for launch city
  serviceArea: {
    city: 'Austin',
    zips: [] as string[], // populated from Supabase or hardcoded list
  },

  // Platform fee (percentage taken from each gig payment)
  platformFeePercent: 15,

  // Pricing defaults
  defaultPricingModel: 'flat' as 'flat' | 'hourly',

  // Photo constraints
  photo: {
    maxDimension: 1600,
    jpegQuality: 0.7,
    maxPhotosPerGig: 10,
  },

  // SMS templates (used by edge functions)
  smsTemplates: {
    newGigNearby: 'New gig near you: {{size}} move, ${{price}}, {{distance}} away. Open Fast Fix Work to apply.',
    customerMatched: '{{moverName}} is matched to your gig! They\'ll arrive at {{time}}.',
    moverMarkedComplete: 'Your mover marked the job complete. Tap to confirm: {{url}}',
  },
} as const;
