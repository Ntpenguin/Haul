import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../../components/primitives';
import { colors, radii } from '../../../lib/theme';
import { useGigDraftStore } from '../../../stores/gigDraft';
import { useGigs } from '../../../hooks/useGigs';
import { useUploadPhoto } from '../../../hooks/useUploadPhoto';
import { StepLocations } from '../../../components/wizard/StepLocations';
import { StepSize } from '../../../components/wizard/StepSize';
import { StepInventory } from '../../../components/wizard/StepInventory';
import { StepCrew } from '../../../components/wizard/StepCrew';
import { StepExtras } from '../../../components/wizard/StepExtras';
import { StepSchedule } from '../../../components/wizard/StepSchedule';
import { StepContact } from '../../../components/wizard/StepContact';
import { StepReview } from '../../../components/wizard/StepReview';
import { formatCents, priceFor } from '../../../lib/pricing';

function getSteps(homeSize: string) {
  // Category is always 'moving' — other categories are coming soon
  if (homeSize === 'other') {
    return ['locations', 'size', 'extras', 'schedule', 'contact', 'review'] as const;
  }
  return ['locations', 'size', 'inventory', 'crew', 'extras', 'schedule', 'contact', 'review'] as const;
}

export default function NewGigWizard() {
  const router = useRouter();
  const { draft, currentStep, setStep, resetDraft } = useGigDraftStore();
  const STEPS = getSteps(draft.home_size);
  const { createGig, saveDraft } = useGigs();
  const { uploadGigPhoto } = useUploadPhoto();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);

  const total = STEPS.length;
  const stepName = STEPS[currentStep];

  function handleBack() {
    if (currentStep === 0) {
      router.back();
    } else {
      setStep(currentStep - 1);
    }
  }

  function validateStep(): string | null {
    switch (stepName) {
      case 'locations':
        if (!draft.from_address.trim()) return 'Enter a pickup address';
        if (!draft.from_lat) return 'Select a pickup address from the suggestions';
        if (!draft.to_address.trim()) return 'Enter a drop-off address';
        if (!draft.to_lat) return 'Select a drop-off address from the suggestions';
        return null;
      case 'size':
        if (!draft.home_size) return 'Select a move size';
        return null;
      case 'contact':
        if (!draft.contact_first_name.trim()) return 'Enter your first name';
        if (!draft.contact_last_name.trim()) return 'Enter your last name';
        if (!draft.contact_phone.trim()) return 'Enter your phone number';
        if (!draft.contact_email.trim()) return 'Enter your email';
        return null;
      // inventory, crew, extras, schedule, review — no required fields
      default:
        return null;
    }
  }

  async function handleNext() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');

    if (currentStep === total - 1) {
      setSubmitting(true);
      try {
        const photos = draft.photos;
        const gigId = await createGig('flat', draftId);

        // Upload photos in parallel
        if (photos.length > 0) {
          const results = await Promise.allSettled(
            photos.map((photo) => uploadGigPhoto(photo.uri, gigId, photo.label))
          );
          const failures = results.filter((r) => r.status === 'rejected');
          if (failures.length > 0) {
            console.warn('Photo upload failures:', failures);
          }
        }

        resetDraft();
        router.replace({ pathname: '/(customer)/gig/[id]', params: { id: gigId, justPosted: '1' } });
      } catch (err: any) {
        setError(err.message || 'Failed to post gig');
        setSubmitting(false);
      }
    } else {
      const nextStep = currentStep + 1;
      setStep(nextStep);
      // Persist progress as a draft gig (best-effort) tagged with the step
      // the user is now on, so abandonment is visible in admin.
      saveDraft(draftId, STEPS[nextStep]).then((id) => {
        if (id && id !== draftId) setDraftId(id);
      });
    }
  }

  // Calculate price for the footer button text
  const price = priceFor({
    homeSize: draft.home_size,
    crew: draft.crew_size,
    truck: draft.truck_size,
    stairsFrom: draft.stairs_from,
    stairsTo: draft.stairs_to,
    elevatorFrom: draft.elevator_from,
    elevatorTo: draft.elevator_to,
    longCarry: draft.long_carry,
    heavyItems: draft.heavy_items,
    distanceMiles: draft.distance_miles || undefined,
  }, 'flat');

  const isLast = currentStep === total - 1;
  const categoryLabels: Record<string, string> = { moving: 'moving', cleaning: 'cleaning', landscaping: 'landscaping', auto: 'auto' };
  const buttonLabel = isLast
    ? draft.home_size === 'other' && draft.gig_category === 'moving'
      ? 'Request custom quote'
      : draft.gig_category !== 'moving'
        ? `Post ${categoryLabels[draft.gig_category]} gig`
        : `Post moving gig - ${formatCents(price.totalCents)}`
    : 'Continue';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header with progress */}
      <View style={{ paddingTop: 54, paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={handleBack}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1, height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${((currentStep + 1) / total) * 100}%`, backgroundColor: colors.accent.base }} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink2 }}>
            {currentStep + 1}/{total}
          </Text>
        </View>
      </View>

      {/* Step content */}
      <View style={{ flex: 1 }}>
        {stepName === 'locations' && <StepLocations />}
        {stepName === 'size' && <StepSize />}
        {stepName === 'inventory' && <StepInventory />}
        {stepName === 'crew' && <StepCrew />}
        {stepName === 'extras' && <StepExtras />}
        {stepName === 'schedule' && <StepSchedule />}
        {stepName === 'contact' && <StepContact />}
        {stepName === 'review' && <StepReview />}
      </View>

      {/* Error message */}
      {error ? (
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 13, color: colors.error, fontWeight: '500' }}>{error}</Text>
        </View>
      ) : null}

      {/* Footer button */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 38, backgroundColor: colors.bg }}>
        <Button onPress={handleNext} loading={submitting}>{buttonLabel}</Button>
      </View>
    </View>
  );
}
