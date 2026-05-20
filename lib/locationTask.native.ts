import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export const LOCATION_TASK = 'ffx-background-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.[0]) return;
  const loc = data.locations[0];

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return;

  await supabase.from('mover_locations').upsert({
    mover_id: userId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    updated_at: new Date().toISOString(),
  });
});
