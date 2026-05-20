import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Avatar } from '../../components/primitives';
import { colors, radii } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { properCase } from '../../lib/nameFormat';
import { filterName, formatPhone, isValidEmail } from '../../lib/validate';

export default function MoverSettings() {
  const router = useRouter();
  const { profile, signOut, deleteAccount } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({
    moving: '#F59E0B',
    cleaning: '#3B82F6',
    landscaping: '#22C55E',
    auto: '#F97316',
  });

  useEffect(() => {
    if (profile) {
      const parts = (profile.full_name || '').split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  // Load mover-specific fields + reviews
  useEffect(() => {
    async function loadMoverProfile() {
      if (!profile?.id) return;
      const [{ data: mp }, { data: rv }] = await Promise.all([
        supabase.from('mover_profiles').select('bio, vehicle_type').eq('id', profile.id).maybeSingle(),
        supabase.from('reviews').select('*, reviewer:reviewer_id(full_name)').eq('reviewee_id', profile.id).order('created_at', { ascending: false }),
      ]);
      if (mp) { setBio(mp.bio || ''); setVehicleType(mp.vehicle_type || ''); }
      if (rv) setReviews(rv);
      if (profile?.category_colors) setCategoryColors({ ...categoryColors, ...profile.category_colors });
    }
    loadMoverProfile();
  }, [profile]);

  async function handleSave() {
    if (!profile?.id) return;
    if (email && !isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const [profileRes, moverRes] = await Promise.all([
        supabase
          .from('profiles')
          .update({ full_name: fullName, email, phone, category_colors: categoryColors })
          .eq('id', profile.id),
        supabase
          .from('mover_profiles')
          .update({ bio, vehicle_type: vehicleType })
          .eq('id', profile.id),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (moverRes.error) throw moverRes.error;
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to upload a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0] || !profile?.id) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const path = `${profile.id}/avatar.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: `image/${ext}` });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      setAvatarUrl(publicUrl);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account', style: 'destructive', onPress: async () => {
            try {
              await deleteAccount();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete account.');
            }
          },
        },
      ]
    );
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  const inputStyle = {
    height: 54,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.ink,
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.ink3,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 80 }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 24 }}>
        {/* Header */}
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, color: colors.ink2, fontWeight: '500' }}>
            {'\u2190'} Back
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>
          Settings
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, marginBottom: 28, lineHeight: 22 }}>
          Edit your profile information.
        </Text>

        {/* Profile photo */}
        <TouchableOpacity onPress={handlePickPhoto} disabled={uploading} style={{ alignItems: 'center', marginBottom: 28 }}>
          <Avatar
            initials={(firstName[0] || '') + (lastName[0] || '') || '?'}
            uri={avatarUrl || undefined}
            size={88}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Ionicons name="camera-outline" size={15} color={colors.accent.deep} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>
              {uploading ? 'Uploading...' : 'Change photo'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Name */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>First name</Text>
            <TextInput
              value={firstName}
              onChangeText={(v) => setFirstName(properCase(filterName(v)))}
              placeholder="First"
              placeholderTextColor={colors.ink4}
              autoCapitalize="words"
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Last name</Text>
            <TextInput
              value={lastName}
              onChangeText={(v) => setLastName(properCase(filterName(v)))}
              placeholder="Last"
              placeholderTextColor={colors.ink4}
              autoCapitalize="words"
              style={inputStyle}
            />
          </View>
        </View>

        {/* Email */}
        <Text style={{ ...labelStyle, marginTop: 16 }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.ink4}
          keyboardType="email-address"
          autoCapitalize="none"
          style={inputStyle}
        />

        {/* Phone */}
        <Text style={{ ...labelStyle, marginTop: 16 }}>Phone</Text>
        <TextInput
          value={phone}
          onChangeText={(v) => setPhone(formatPhone(v))}
          placeholder="(555) 123-4567"
          placeholderTextColor={colors.ink4}
          keyboardType="phone-pad"
          style={inputStyle}
        />

        {/* Bio */}
        <Text style={{ ...labelStyle, marginTop: 16 }}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Tell customers about yourself..."
          placeholderTextColor={colors.ink4}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{
            ...inputStyle,
            height: 120,
            paddingTop: 14,
          }}
        />

        {/* Vehicle type */}
        <Text style={{ ...labelStyle, marginTop: 16 }}>Vehicle type</Text>
        <TextInput
          value={vehicleType}
          onChangeText={setVehicleType}
          placeholder="e.g. Pickup truck, Box truck"
          placeholderTextColor={colors.ink4}
          style={inputStyle}
        />

        {/* Category colors */}
        <Text style={{ ...labelStyle, marginTop: 24 }}>Job category colors</Text>
        <Text style={{ fontSize: 12, color: colors.ink4, marginBottom: 12, lineHeight: 18 }}>
          Customize how each job type appears on your feed.
        </Text>
        {[
          { key: 'moving', label: 'Moving', icon: 'cube-outline' },
          { key: 'cleaning', label: 'Cleaning', icon: 'sparkles-outline' },
          { key: 'landscaping', label: 'Landscaping', icon: 'leaf-outline' },
          { key: 'auto', label: 'Auto', icon: 'car-outline' },
        ].map((cat) => {
          const SWATCHES = ['#F59E0B', '#3B82F6', '#22C55E', '#F97316', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899'];
          return (
            <View key={cat.key} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name={cat.icon as any} size={16} color={categoryColors[cat.key]} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>{cat.label}</Text>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: categoryColors[cat.key] }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {SWATCHES.map((hex) => (
                  <TouchableOpacity
                    key={hex}
                    onPress={() => setCategoryColors((prev) => ({ ...prev, [cat.key]: hex }))}
                    style={{
                      width: 32, height: 32, borderRadius: 16, backgroundColor: hex,
                      borderWidth: categoryColors[cat.key] === hex ? 3 : 1.5,
                      borderColor: categoryColors[cat.key] === hex ? colors.ink : 'transparent',
                    }}
                  />
                ))}
              </View>
            </View>
          );
        })}

        {/* Save */}
        <View style={{ marginTop: 28 }}>
          <Button onPress={handleSave} loading={saving}>
            Save changes
          </Button>
        </View>

        {/* Reviews received */}
        {(profile?.rating || reviews.length > 0) && (
          <View style={{ marginTop: 36 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 }}>My reviews</Text>
              {profile?.rating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent.soft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Ionicons name="star" size={14} color={colors.accent.base} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>{profile.rating}</Text>
                </View>
              ) : null}
            </View>
            {reviews.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.ink3 }}>No reviews yet.</Text>
            ) : (
              <View style={{ gap: 12 }}>
                {reviews.map((r: any) => (
                  <View key={r.id} style={{ padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
                      {[1,2,3,4,5].map(s => (
                        <Ionicons key={s} name={s <= r.rating ? 'star' : 'star-outline'} size={16} color={colors.accent.base} />
                      ))}
                    </View>
                    {r.comment ? <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 20, marginBottom: 6 }}>"{r.comment}"</Text> : null}
                    <Text style={{ fontSize: 12, color: colors.ink3 }}>— {r.reviewer?.full_name || 'Customer'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            marginTop: 40,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            borderRadius: radii.md,
            borderWidth: 1.5,
            borderColor: colors.error,
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.error }}>Sign out</Text>
        </TouchableOpacity>

        {/* Delete account */}
        <TouchableOpacity onPress={handleDeleteAccount} style={{ marginTop: 16, alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, color: colors.ink4, textDecorationLine: 'underline' }}>Delete account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
