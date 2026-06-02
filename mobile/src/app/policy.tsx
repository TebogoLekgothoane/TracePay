import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { Spacing } from "@/constants/theme";

export default function PolicyScreen() {
  const router = useRouter();

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Data Ethics & Privacy Framework"
        onBack={() => router.back()}
      />
        <ThemedText type="small" className="text-text-muted mb-4">
          Last updated: Jan 2026
        </ThemedText>

        {/* 1. Our Ethical Commitment */}
        <ThemedText type="h3" className="text-text mb-2">
          1. Our Ethical Commitment
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          TracePay is built on the principle that your financial data belongs to you, not to the
          platform. Our goal is to expose hidden financial harm without exploiting, surveilling, or
          manipulating you.
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          We commit to:
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Transparency over complexity
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Consent over coercion
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Insight over extraction
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • User control at every stage
          </ThemedText>
        </View>
        <ThemedText type="small" className="text-text-muted mb-4">
          This framework aligns with FSCA consumer protection principles, SARB Open Finance
          direction, and POPIA.
        </ThemedText>

        {/* 2. Consent-First Data Access */}
        <ThemedText type="h3" className="text-text mb-2">
          2. Consent-First Data Access
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          TracePay follows a granular, informed, and revocable consent model, consistent with FSCA
          guidance on ethical Open Finance.
        </ThemedText>
        <ThemedText type="body" className="text-text mb-1">
          How consent works
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          You explicitly approve:
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Which data sources (bank accounts, MNO wallets)
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • What data (transactions only, no credentials)
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • How long access is granted (default: 90 days)
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Consent in plain language, not legal jargon
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • No bundled or forced consent
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text mb-1">
          Your rights
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Right to refuse – the app still works with partial data
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Right to review – see exactly what data is accessed
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Right to revoke – withdraw consent instantly via Freeze
          </ThemedText>
        </View>

        {/* 3. Secure API-Based Data Architecture */}
        <ThemedText type="h3" className="text-text mb-2">
          3. Secure API-Based Data Architecture
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          TracePay complies with SARB Directive No. 2 of 2024 by using only secure APIs:
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Official Open Banking and MNO APIs only
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • No screen scraping
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • No credential storage or password sharing
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text mb-1">
          Data flow controls
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Read-only access
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Encrypted in transit and at rest
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Short-lived, expiring access tokens
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Logged and auditable access
          </ThemedText>
        </View>

        {/* 4. Data Minimisation & Purpose Limitation */}
        <ThemedText type="h3" className="text-text mb-2">
          4. Data Minimisation &amp; Purpose Limitation
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          We only collect what&apos;s needed to identify financial leaks. We do not:
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Collect contacts, messages, or location
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Sell or share personal financial data
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Use data for advertising or profiling
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text mb-1">
          Purpose limitation
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Fee and penalty detection
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Airtime &amp; subscription leak analysis
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • High-level behavioural pattern recognition
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • No automated decisions that deny credit or benefits
          </ThemedText>
        </View>

        {/* 5. Radical Transparency */}
        <ThemedText type="h3" className="text-text mb-2">
          5. Radical Transparency &amp; Explainability
        </ThemedText>
        <ThemedText type="body" className="text-text mb-3">
          You can always trace each finding back to the real transactions that generated it. We
          favour plain-language summaries over raw data dumps so insights stay understandable.
        </ThemedText>

        {/* 6. The Freeze Button */}
        <ThemedText type="h3" className="text-text mb-2">
          6. The Freeze Button: Control by Design
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          At any time you can press Freeze to:
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Instantly revoke all API access
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Delete cached personal data
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Halt all analysis
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Receive in-app confirmation of deletion
          </ThemedText>
        </View>

        {/* 7. MNO Data */}
        <ThemedText type="h3" className="text-text mb-2">
          7. Ethical Use of MNO Data (Optional)
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          If you connect MTN MoMo, VodaPay, or similar wallets:
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • It is strictly opt-in
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Used only to detect airtime drain, cash-out costs, and subscription traps
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Never used for credit scoring without fresh, explicit consent
          </ThemedText>
        </View>

        {/* 8. Governance */}
        <ThemedText type="h3" className="text-text mb-2">
          8. Governance &amp; Accountability
        </ThemedText>
        <View className="mb-4">
          <ThemedText type="body" className="text-text">
            • Regular internal data audits
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Clear data breach response procedures
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Ethics-first design reviews for new features
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • No monetisation of personal data
          </ThemedText>
        </View>

        {/* Consent recap */}
        <ThemedText type="h3" className="text-text mb-2">
          Consent to Use Your Financial Data
        </ThemedText>
        <ThemedText type="body" className="text-text mb-2">
          By tapping &quot;I Agree&quot; in the consent screen, you give permission for TracePay to:
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Access your bank transactions (amounts, dates, fees)
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • (Optional) Analyse your mobile airtime and mobile money spending patterns
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text mb-1">
          Why we need this data
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Show you where your money is being lost
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Identify hidden fees, silent deductions, and airtime drains
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Help you take control of your money
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text mb-1">
          What we do NOT do
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • We do not sell your data
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • We do not access your passwords
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • We do not move money without your action
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text mb-1">
          Your rights
        </ThemedText>
        <View className="mb-3">
          <ThemedText type="body" className="text-text">
            • Choose what data to share
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Withdraw consent at any time
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Request deletion of your data
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text mb-1">
          Important
        </ThemedText>
        <View className="mb-6">
          <ThemedText type="body" className="text-text">
            • Your data is protected and encrypted
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • Access is strictly read-only
          </ThemedText>
          <ThemedText type="body" className="text-text">
            • We follow South African financial regulations and fair-treatment rules
          </ThemedText>
        </View>
    </ScreenContainer>
  );
}

