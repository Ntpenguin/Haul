import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadToStorage } from '../../hooks/useUploadPhoto';
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
  const [vehicleMakeModel, setVehicleMakeModel] = useState('');
  const [vehicleSuggestions, setVehicleSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
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
        supabase.from('mover_profiles').select('bio, vehicle_type, vehicle_make_model').eq('id', profile.id).maybeSingle(),
        supabase.from('reviews').select('*, reviewer:reviewer_id(full_name)').eq('reviewee_id', profile.id).order('created_at', { ascending: false }),
      ]);
      if (mp) { setBio(mp.bio || ''); setVehicleType(mp.vehicle_type || ''); setVehicleMakeModel(mp.vehicle_make_model || ''); }
      if (rv) setReviews(rv);
      if (profile?.category_colors) setCategoryColors({ ...categoryColors, ...profile.category_colors });
      const { data: blocks } = await supabase.from('user_blocks').select('*, blocked:blocked_id(id, full_name, avatar_url)').eq('blocker_id', profile?.id || '');
      if (blocks) setBlockedUsers(blocks);
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
          .update({ bio, vehicle_type: vehicleType, vehicle_make_model: vehicleMakeModel || null })
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
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const path = `${profile.id}/avatar.${ext}`;
      await uploadToStorage(asset.uri, 'avatars', path);
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

        {/* Vehicle */}
        <Text style={{ ...labelStyle, marginTop: 16 }}>Vehicle type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {[
            { id: 'own-truck', label: 'Truck owner' },
            { id: 'own-van', label: 'Van owner' },
            { id: 'rent', label: 'Rents trucks' },
            { id: 'muscle', label: 'No vehicle' },
          ].map((o) => {
            const active = vehicleType === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                onPress={() => { setVehicleType(o.id); if (o.id === 'muscle') setVehicleMakeModel(''); }}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: active ? colors.accent.base : colors.surface,
                  borderWidth: 1.5, borderColor: active ? colors.accent.base : colors.line,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.ink2 }}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {vehicleType && vehicleType !== 'muscle' && (
          <>
            <TextInput
              value={vehicleMakeModel}
              onChangeText={(v) => {
                setVehicleMakeModel(v);
                setVehicleSuggestions(
                  v.length >= 1
                    ? ['Ford F-150','Ford F-250','Ford Transit Cargo Van','Chevrolet Silverado 1500','GMC Sierra 1500','Ram 1500','Ram 2500','Ram ProMaster','Mercedes-Benz Sprinter','Isuzu NPR','10ft Box Truck','16ft Box Truck','20ft Box Truck','26ft Box Truck','Toyota Tundra','Ram 3500']
                        .filter(s => s.toLowerCase().includes(v.toLowerCase())).slice(0, 5)
                    : []
                );
              }}
              placeholder="Make & model (e.g. Ford F-150)"
              placeholderTextColor={colors.ink4}
              style={inputStyle}
            />
            {vehicleSuggestions.length > 0 && (
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden', marginTop: 2 }}>
                {vehicleSuggestions.map((s) => (
                  <TouchableOpacity key={s} onPress={() => { setVehicleMakeModel(s); setVehicleSuggestions([]); }}
                    style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                    <Text style={{ fontSize: 14, color: colors.ink }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

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

        {/* Blocked Users */}
        <View style={{ marginTop: 36 }}>
          <Text style={{ ...labelStyle, marginBottom: 12 }}>Blocked Users</Text>
          {blockedUsers.length === 0 ? (
            <Text style={{ fontSize: 14, color: colors.ink4, paddingVertical: 8 }}>No blocked users.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {blockedUsers.map((b: any) => (
                <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person-outline" size={18} color={colors.ink3} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink }}>{b.blocked?.full_name || 'Unknown user'}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Unblock', `Unblock ${b.blocked?.full_name || 'this user'}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Unblock', onPress: async () => {
                          await supabase.from('user_blocks').delete().eq('id', b.id);
                          setBlockedUsers(prev => prev.filter((x: any) => x.id !== b.id));
                        }},
                      ]);
                    }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.md, backgroundColor: colors.surface }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink2 }}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Legal */}
        <View style={{ marginTop: 40 }}>
          <Text style={{ ...labelStyle, marginBottom: 12 }}>Legal</Text>
          <TouchableOpacity
            onPress={() => router.push('/terms')}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(26,23,20,0.08)' }}
          >
            <Text style={{ fontSize: 15, color: colors.ink }}>Terms & Conditions</Text>
            <Text style={{ fontSize: 18, color: colors.ink4 }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/privacy-policy')}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(26,23,20,0.08)' }}
          >
            <Text style={{ fontSize: 15, color: colors.ink }}>Privacy Policy</Text>
            <Text style={{ fontSize: 18, color: colors.ink4 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            marginTop: 20,
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
