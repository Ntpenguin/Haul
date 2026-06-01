// Photo upload hook — compress + upload to Supabase Storage

import { ImageManipulator } from 'expo-image-manipulator';
// SDK 54 moved the classic uploadAsync / FileSystemUploadType API to the legacy
// entry point; the new top-level API is class-based (File/Directory/Paths).
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { APP_CONFIG } from '../lib/config';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export async function uploadToStorage(uri: string, bucket: string, path: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  const result = await FileSystem.uploadAsync(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'image/jpeg',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    },
  );
  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Upload failed: ${result.body}`);
  }
}

export function useUploadPhoto() {
  async function uploadGigPhoto(
    uri: string,
    gigId: string,
    label?: string,
    phase?: string,
  ): Promise<string> {
    // Compress image
    let finalUri = uri;
    try {
      const image = ImageManipulator.manipulate(uri);
      image.resize({ width: APP_CONFIG.photo.maxDimension });
      const result = await image.renderAsync();
      finalUri = result.uri;
    } catch (e) {
      console.warn('Image manipulation failed, uploading original:', e);
    }

    // Generate unique filename
    const filename = `${gigId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

    await uploadToStorage(finalUri, 'gig-photos', filename);

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
        phase: phase || null,
      });

    if (dbError) throw dbError;

    return publicUrl;
  }

  return { uploadGigPhoto };
}
