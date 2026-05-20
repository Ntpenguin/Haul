// Photo upload hook — compress + upload to Supabase Storage

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { APP_CONFIG } from '../lib/config';

export function useUploadPhoto() {
  async function uploadGigPhoto(
    uri: string,
    gigId: string,
    label?: string,
  ): Promise<string> {
    // Compress image using expo-image-manipulator v14 API
    let finalUri = uri;
    try {
      const image = ImageManipulator.manipulate(uri);
      image.resize({ width: APP_CONFIG.photo.maxDimension });
      const result = await image.renderAsync();
      finalUri = result.uri;
    } catch (e) {
      // If manipulation fails, upload the original
      console.warn('Image manipulation failed, uploading original:', e);
    }

    // Generate unique filename
    const filename = `${gigId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

    // Read file as blob
    const response = await fetch(finalUri);
    const blob = await response.blob();

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('gig-photos')
      .upload(filename, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('gig-photos')
      .getPublicUrl(filename);

    // Insert record in gig_photos table
    const { error: dbError } = await supabase
      .from('gig_photos')
      .insert({
        gig_id: gigId,
        url: publicUrl,
        label: label || null,
      });

    if (dbError) throw dbError;

    return publicUrl;
  }

  return { uploadGigPhoto };
}
