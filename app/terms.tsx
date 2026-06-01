import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../lib/theme';

export default function TermsScreen() {
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
          Moving Services Agreement
        </Text>
        <Text style={{ fontSize: 13, color: colors.ink3, marginBottom: 32 }}>
          Last updated: May 27, 2026
        </Text>

        <Section title="1. Scope of Services">
          <P>Fast Fix Work LLC ("Company," "we," "us") agrees to provide loading, transporting, and unloading of the Customer's belongings as specified ("Services"). The Company will provide appropriately trained personnel and necessary equipment for the move.</P>
        </Section>

        <Section title="2. Fees and Payment Terms">
          <P><B>Hourly rate.</B> Where applicable, the Customer agrees to pay the Company the agreed hourly rate, which includes workers, a truck or trailer as needed, applicable taxes, fees, and charges. Otherwise, the agreed flat rate applies.</P>
          <P><B>Payment in full.</B> The full job price is collected via credit card through the app at the time of booking. An appointment is not secured until payment is made in full.</P>
          <P><B>Mover payouts.</B> After the Services are completed, the Company pays the assigned mover their earnings (the job price less the Company's service fee). Refunds for cancellations are handled per the Cancellation policy below.</P>
        </Section>

        <Section title="3. Customer Responsibilities">
          <P>• <B>Packing:</B> The Customer is responsible for ensuring all items are properly packed and ready for transport unless packing services are included.</P>
          <P>• <B>Disclosure:</B> The Customer must disclose any fragile, valuable, or hazardous items before the move.</P>
          <P>• <B>Premises access:</B> The Customer must ensure adequate access to the premises for the moving vehicle and personnel.</P>
          <P>• <B>Hostile environment:</B> The Company reserves the right to terminate services immediately in the event of a hostile or verbally abusive environment. Movers shall not be required to work under such conditions.</P>
        </Section>

        <Section title="4. Prohibited Items">
          <P>The Company does not transport, and is not liable for damage, injury, or loss caused by inflammable, explosive, or hazardous materials, including gasoline, propane tanks, fireworks, chemicals, and aerosol cans. Customers must ensure these items are not included in their belongings. If discovered, such items will be removed, and delays or additional charges may apply.</P>
        </Section>

        <Section title="5. Limitations of Liability">
          <P><B>Packing issues:</B> The Company is not liable for damages to items not properly packed by the Customer. The Company is not responsible for items that were packed before our service or were already damaged.</P>
          <P><B>Cheap, particleboard & IKEA-style furniture:</B> The Company is not responsible for damage to furniture made of particleboard, pressboard, MDF, or similar composite materials (including but not limited to IKEA, Wayfair, and similar flat-pack/budget furniture). These items are inherently fragile and not designed to withstand the stress of disassembly, reassembly, or transport. Customers move these items at their own risk.</P>
          <P><B>Pre-existing damage:</B> The Company is not responsible for items that were damaged, worn, or in weakened condition prior to the move. This includes furniture with existing cracks, loose joints, chipped veneer, water damage, or structural wear.</P>
          <P><B>Waiver of liability:</B> If the Company advises the Customer that an item may cause damage due to not fitting in the desired location, the Customer waives all claims for property or item damage resulting from attempting to place it there.</P>
          <P><B>Delays:</B> The Company is not liable for delays caused by circumstances beyond its control, including but not limited to weather, traffic, or road conditions.</P>
          <P><B>Item liability:</B> The Company's liability for loss or damage is limited to $0.60 per pound per item unless otherwise agreed upon in writing. Minor damages such as tiny scratches are not reimbursable. Repairs take priority over the $0.60/lb liability.</P>
          <P><B>Exclusions:</B> No coverage for items not packed by the mover, pressboard/particleboard furniture, fragile items not crated, or electronics left inside drawers.</P>
          <P><B>Claims:</B> Customers must prove: (i) the item was in good condition before the move; (ii) the item was damaged while in the Company's custody; (iii) the damage was not due to improper packing by the Customer, inherent defect, pre-existing damage, or acts of God. Claims must be submitted within 72 hours of job completion.</P>
        </Section>

        <Section title="6. Undisclosed Items">
          <P>The Company shall be obligated to transport only those items disclosed prior to the commencement of services. The Company reserves the right to refuse movement of any undisclosed or additional items.</P>
        </Section>

        <Section title="7. Safety">
          <P>Customer shall not be responsible for any injury sustained by the Company's employees while performing moving services, except where such injury is caused by hazardous conditions on the Customer's premises that the Customer knew, or reasonably should have known, existed and failed to remedy or disclose.</P>
        </Section>

        <Section title="8. Mover Responsibilities">
          <P>• Complete mover onboarding truthfully, including identity verification. Providing false information is grounds for immediate removal.</P>
          <P>• Perform jobs professionally, on time, and with appropriate care for the customer's belongings.</P>
          <P>• Maintain any required licenses, insurance, and vehicle registrations required under Texas law.</P>
          <P>• You are responsible for reporting income from jobs to the IRS and Texas state tax authorities.</P>
          <P>• Do not solicit customers to transact outside the App for the purpose of avoiding platform fees.</P>
        </Section>

        <Section title="9. Dispute Resolution">
          <P>Both parties agree to resolve disputes through good faith negotiations. The Customer must provide the Company with written notice of any dispute within 72 hours, including a detailed description of the issue. In case of emergency, call 911.</P>
        </Section>

        <Section title="10. Cancellation">
          <P>Either party may cancel the Agreement in writing. Any changes to the Agreement must be made in writing and agreed upon by both parties.</P>
        </Section>

        <Section title="11. Governing Law">
          <P>This Agreement is governed by the laws of the State of Texas. Any disputes shall be resolved in the state or federal courts located in Travis County, Texas.</P>
        </Section>

        <Section title="12. Contact">
          <P>Fast Fix Work LLC{'\n'}Austin, Texas{'\n'}support@fastfixwork.com</P>
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
