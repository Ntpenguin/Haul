import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radii } from '../lib/theme';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: 60, paddingHorizontal: 24 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, color: colors.ink2, fontWeight: '500' }}>
            {'\u2190'} Back
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          Privacy Policy
        </Text>
        <Text style={{ fontSize: 13, color: colors.ink3, marginBottom: 32 }}>
          Last updated: May 20, 2026
        </Text>

        <Section title="1. Who We Are">
          <P>Fast Fix Work ("FFW," "we," "us," or "our") operates the Fast Fix Work mobile application — a two-sided marketplace connecting customers with independent movers in the Austin, Texas area. Our contact email is support@fastfixwork.com.</P>
        </Section>

        <Section title="2. Information We Collect">
          <P><B>Account information.</B> When you create an account we collect your name, email address, and phone number. Movers also provide a bio and vehicle type during onboarding.</P>
          <P><B>Profile photos.</B> You may optionally upload a profile photo, which is stored securely in our cloud storage.</P>
          <P><B>Job information.</B> Customers provide pickup and drop-off addresses, move size details, photos of items, preferred schedule, and special instructions when creating a job posting.</P>
          <P><B>Location data.</B> Movers who tap "I'm on my way" share their real-time GPS location with the matched customer for the duration of that trip. We do not track location at any other time. Customers' addresses are used only for job matching and mapping.</P>
          <P><B>Messages.</B> Chat messages between customers and movers are stored to deliver and display them within the app.</P>
          <P><B>Payment information.</B> We do not store card numbers. Payments are processed by Stripe. We store transaction status and amounts to track job payments and mover payouts.</P>
          <P><B>Reviews and ratings.</B> Reviews you leave or receive are stored and displayed on profiles.</P>
          <P><B>Push notification tokens.</B> If you grant notification permission, we store a device token to send you job updates.</P>
          <P><B>Device and usage data.</B> We may collect basic device information (OS, app version) for debugging purposes.</P>
        </Section>

        <Section title="3. How We Use Your Information">
          <P>• Match customers with available movers based on location and job requirements.</P>
          <P>• Deliver real-time location of your mover while they are en route.</P>
          <P>• Process the full job payment via Stripe and pay out movers after the job.</P>
          <P>• Send push notifications about job status, new applications, and account activity.</P>
          <P>• Display your profile (name, photo, rating) to the other party in a matched job.</P>
          <P>• Improve and maintain the app through aggregated, anonymized usage analytics.</P>
          <P>• Respond to support requests and investigate safety reports.</P>
        </Section>

        <Section title="4. Information We Share">
          <P><B>With the matched party.</B> When a job is matched, the customer's name, phone number, and job address are visible to the mover, and the mover's name, photo, rating, and bio are visible to the customer.</P>
          <P><B>With Stripe.</B> We share transaction details with Stripe, Inc. to process payments. Stripe's privacy policy governs their use of that data (stripe.com/privacy).</P>
          <P><B>With Supabase.</B> Our backend infrastructure (database, authentication, file storage) is provided by Supabase, Inc. Your data is stored on their servers in the United States.</P>
          <P><B>With Expo.</B> Push notifications are routed through Expo's push notification service.</P>
          <P><B>Legal requirements.</B> We may disclose information if required by law or to protect the rights and safety of our users or the public.</P>
          <P>We do not sell your personal information to third parties.</P>
        </Section>

        <Section title="5. Location Data">
          <P>Movers' live location is only shared with the matched customer while the mover has manually activated tracking by tapping "I'm on my way." Tracking stops when the job is marked complete or the session ends. We do not run background location tracking without your explicit action.</P>
          <P>Customer addresses are shared with matched movers to enable navigation. They are not shared with unmatched users.</P>
        </Section>

        <Section title="6. Data Retention">
          <P>We retain your account data as long as your account is active. You may request deletion at any time by using the "Delete account" option in Settings, which permanently removes your profile, messages, and associated data. Some records (e.g., completed transaction records) may be retained for up to 7 years for legal and accounting compliance.</P>
        </Section>

        <Section title="7. Security">
          <P>We use industry-standard security measures including TLS encryption in transit, Row Level Security (RLS) policies on our database, and access controls. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</P>
        </Section>

        <Section title="8. Children's Privacy">
          <P>Fast Fix Work is not directed to individuals under 18 years of age. We do not knowingly collect personal information from minors. If we learn that we have done so, we will delete that information promptly.</P>
        </Section>

        <Section title="9. Your Rights">
          <P>You may access, correct, or delete your personal information at any time through the Settings screen. To request a full data export or to raise a privacy concern, email us at support@fastfixwork.com.</P>
        </Section>

        <Section title="10. Changes to This Policy">
          <P>We may update this Privacy Policy from time to time. We will notify you of material changes via a push notification or in-app banner. Continued use of the app after changes are posted constitutes acceptance of the updated policy.</P>
        </Section>

        <Section title="11. Contact Us">
          <P>Fast Fix Work{'\n'}Austin, Texas{'\n'}support@fastfixwork.com</P>
        </Section>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10, letterSpacing: -0.2 }}>
        {title}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 14, color: colors.ink2, lineHeight: 22 }}>{children}</Text>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontWeight: '700', color: colors.ink }}>{children}</Text>
  );
}
