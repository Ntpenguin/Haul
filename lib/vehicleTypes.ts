export const VEHICLE_CATEGORY_LABELS: Record<string, string> = {
  'own-truck': 'Truck owner',
  'own-van': 'Van owner',
  'muscle': 'Muscle only',
  'rent': 'Rents trucks',
};

export function vehicleCategoryLabel(type: string | null | undefined): string {
  if (!type) return 'No vehicle';
  return VEHICLE_CATEGORY_LABELS[type] ?? type;
}

export function vehicleDisplay(type: string | null | undefined, makeModel: string | null | undefined): string {
  if (!type || type === 'muscle') return 'Muscle only (no vehicle)';
  if (makeModel) return makeModel;
  return vehicleCategoryLabel(type);
}

export function hasVehicle(type: string | null | undefined): boolean {
  return !!(type && type !== 'muscle' && type !== 'none');
}
