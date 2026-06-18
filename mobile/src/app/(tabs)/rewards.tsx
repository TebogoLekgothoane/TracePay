import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/theme-context";
import { useProfileStore } from "@/stores/profileStore";

const EARN_METHODS = [
  { icon: "radar" as const, label: "Scan SMS Inbox", sub: "Analyse for new leaks", pts: "+50", color: "#7C3AED", bg: "#F5F3FF" },
  { icon: "snowflake" as const, label: "Freeze a Leak", sub: "Stop an active money leak", pts: "+30", color: "#0284C7", bg: "#F0F9FF" },
  { icon: "account-plus-outline" as const, label: "Invite a Friend", sub: "Share TracePay with someone", pts: "+200", color: "#16A34A", bg: "#F0FDF4" },
  { icon: "brain" as const, label: "Use AI Budget", sub: "Generate a weekly plan", pts: "+20", color: "#D97706", bg: "#FFFBEB" },
  { icon: "receipt" as const, label: "Pay a Bill", sub: "Via linked account", pts: "+50", color: "#DC2626", bg: "#FEF2F2" },
];

const PARTNERS = [
  { id: "shoprite", name: "Shoprite", offer: "5% off groceries", pts: 150, color: "#DC2626" },
  { id: "pnp", name: "Pick n Pay", offer: "R20 voucher", pts: 200, color: "#16A34A" },
  { id: "checkers", name: "Checkers", offer: "3% cashback", pts: 180, color: "#0085C7" },
  { id: "clicks", name: "Clicks", offer: "R15 off", pts: 100, color: "#7C3AED" },
  { id: "mrprice", name: "Mr Price", offer: "10% off", pts: 120, color: "#D97706" },
  { id: "woolworths", name: "Woolworths", offer: "8% off food", pts: 160, color: "#111827" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHECKED_DAYS = [0, 1, 2, 3];

function getLevelInfo(pts: number) {
  if (pts >= 15000) return { name: "Platinum", next: null, nextPts: 15000, color: "#9CA3AF", progress: 1 };
  if (pts >= 5000) return { name: "Gold", next: "Platinum", nextPts: 15000, color: "#D97706", progress: (pts - 5000) / 10000 };
  if (pts >= 1000) return { name: "Silver", next: "Gold", nextPts: 5000, color: "#94A3B8", progress: (pts - 1000) / 4000 };
  return { name: "Bronze", next: "Silver", nextPts: 1000, color: "#92400E", progress: pts / 1000 };
}

export default function RewardsScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { rewardPoints, addRewardPoints } = useProfileStore();
  const level = getLevelInfo(rewardPoints);
  const [checkedIn, setCheckedIn] = useState(false);

  const handleCheckIn = () => {
    if (!checkedIn) {
      addRewardPoints(10);
      setCheckedIn(true);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bgAlt }]}>
      <View style={[styles.headerBar, { paddingTop: isWeb ? 67 + 16 : insets.top + 16, backgroundColor: c.bg, borderBottomColor: c.borderSoft }]}>
        <Text style={[styles.screenTitle, { color: c.text }]}>Rewards & Perks</Text>
        <Text style={[styles.screenSub, { color: c.textMuted }]}>Earn points by improving your finances</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: isWeb ? 100 : 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pointsCard}>
          <View style={styles.pcRing1} />
          <View style={styles.pcRing2} />
          <View style={styles.pcTop}>
            <View>
              <Text style={styles.pcLabel}>YOUR POINTS</Text>
              <Text style={styles.pcPoints}>{rewardPoints.toLocaleString()}</Text>
            </View>
            <View style={[styles.levelBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <MaterialCommunityIcons name="medal" size={14} color="#FCD34D" />
              <Text style={styles.levelBadgeText}>{level.name}</Text>
            </View>
          </View>
          {level.next && (
            <View style={styles.pcProgress}>
              <View style={styles.pcProgressTrack}>
                <View style={[styles.pcProgressFill, { width: `${Math.round(level.progress * 100)}%` }]} />
              </View>
              <Text style={styles.pcProgressLabel}>
                {(level.nextPts - rewardPoints).toLocaleString()} pts to {level.next}
              </Text>
            </View>
          )}
          <View style={styles.pcStats}>
            <View style={styles.pcStat}>
              <Text style={styles.pcStatVal}>4</Text>
              <Text style={styles.pcStatLbl}>Leaks frozen</Text>
            </View>
            <View style={styles.pcStatDivider} />
            <View style={styles.pcStat}>
              <Text style={styles.pcStatVal}>R685</Text>
              <Text style={styles.pcStatLbl}>Saved</Text>
            </View>
            <View style={styles.pcStatDivider} />
            <View style={styles.pcStat}>
              <Text style={styles.pcStatVal}>12</Text>
              <Text style={styles.pcStatLbl}>Days streak</Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.borderSoft }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Daily Check-in</Text>
            <Text style={[styles.sectionSub, { color: c.textMuted }]}>+10 pts per day</Text>
          </View>
          <View style={styles.daysRow}>
            {DAYS.map((day, i) => {
              const done = CHECKED_DAYS.includes(i) || (i === 4 && checkedIn);
              const isToday = i === 4;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayChip,
                    done ? { backgroundColor: c.primary } : { backgroundColor: c.surfaceAlt, borderColor: c.border, borderWidth: 1 },
                  ]}
                  onPress={isToday ? handleCheckIn : undefined}
                  activeOpacity={isToday && !checkedIn ? 0.75 : 1}
                >
                  <Text style={[styles.dayLabel, { color: done ? "#fff" : c.textMuted }]}>{day}</Text>
                  {done && <MaterialCommunityIcons name="check" size={10} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>
          {!checkedIn && (
            <TouchableOpacity
              style={[styles.checkInBtn, { backgroundColor: c.primaryXSoft, borderColor: c.primarySoft }]}
              onPress={handleCheckIn}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="calendar-check" size={16} color={c.primary} />
              <Text style={[styles.checkInText, { color: c.primary }]}>Check in today (+10 pts)</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.listLabel, { color: c.textMuted }]}>MORE WAYS TO EARN</Text>
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.borderSoft }]}>
          {EARN_METHODS.map((m, i) => (
            <View key={m.label}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: c.borderSoft }]} />}
              <TouchableOpacity style={styles.earnRow} activeOpacity={0.7}>
                <View style={[styles.earnIcon, { backgroundColor: m.bg }]}>
                  <MaterialCommunityIcons name={m.icon} size={20} color={m.color} />
                </View>
                <View style={styles.earnInfo}>
                  <Text style={[styles.earnLabel, { color: c.text }]}>{m.label}</Text>
                  <Text style={[styles.earnSub, { color: c.textMuted }]}>{m.sub}</Text>
                </View>
                <View style={[styles.ptsBadge, { backgroundColor: c.primaryXSoft }]}>
                  <Text style={[styles.ptsBadgeText, { color: c.primary }]}>{m.pts}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={[styles.listLabel, { color: c.textMuted }]}>PARTNER DEALS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.partnersScroll}
          style={styles.partnersWrap}
        >
          {PARTNERS.map((p) => {
            const canRedeem = rewardPoints >= p.pts;
            return (
              <View key={p.id} style={[styles.partnerCard, { backgroundColor: c.surface, borderColor: c.borderSoft }]}>
                <View style={[styles.partnerIconBox, { backgroundColor: p.color + "18" }]}>
                  <Text style={[styles.partnerInitial, { color: p.color }]}>{p.name[0]}</Text>
                </View>
                <Text style={[styles.partnerName, { color: c.text }]}>{p.name}</Text>
                <Text style={[styles.partnerOffer, { color: c.textSub }]}>{p.offer}</Text>
                <View style={styles.partnerPtsRow}>
                  <MaterialCommunityIcons name="star-circle-outline" size={12} color={c.primary} />
                  <Text style={[styles.partnerPts, { color: c.primary }]}>{p.pts} pts</Text>
                </View>
                <TouchableOpacity
                  style={[styles.redeemBtn, canRedeem ? { backgroundColor: c.primary } : { backgroundColor: c.surfaceAlt, borderColor: c.border, borderWidth: 1 }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.redeemText, { color: canRedeem ? "#fff" : c.textMuted }]}>
                    {canRedeem ? "Redeem" : "Need more"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 4 },
  screenSub: { fontSize: 13, fontFamily: "Inter_400Regular" },

  scroll: { flex: 1 },
  body: { paddingHorizontal: 18, paddingTop: 16 },

  pointsCard: {
    backgroundColor: "#7C3AED", borderRadius: 20, padding: 22,
    marginBottom: 18, overflow: "hidden", position: "relative",
  },
  pcRing1: {
    position: "absolute", top: -40, right: -40,
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  pcRing2: {
    position: "absolute", bottom: -20, left: -20,
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  pcTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  pcLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.7)", letterSpacing: 1, marginBottom: 4 },
  pcPoints: { fontSize: 42, fontFamily: "Inter_700Bold", color: "#FFFFFF", lineHeight: 48 },
  levelBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  levelBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FCD34D" },

  pcProgress: { marginBottom: 20 },
  pcProgressTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  pcProgressFill: { height: 6, backgroundColor: "#FFFFFF", borderRadius: 3 },
  pcProgressLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },

  pcStats: { flexDirection: "row", justifyContent: "space-around" },
  pcStat: { alignItems: "center" },
  pcStatVal: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 2 },
  pcStatLbl: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)" },
  pcStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.15)" },

  section: {
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1,
  },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  daysRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  dayChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, gap: 3 },
  dayLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  checkInBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, paddingVertical: 12, borderWidth: 1.5,
  },
  checkInText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  listLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 10 },

  divider: { height: 1 },
  earnRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  earnIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  earnInfo: { flex: 1 },
  earnLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  earnSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  ptsBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  ptsBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  partnersWrap: { marginBottom: 16 },
  partnersScroll: { gap: 12, paddingRight: 4 },
  partnerCard: {
    width: 140, borderRadius: 16, padding: 14, borderWidth: 1,
    alignItems: "center", gap: 6,
  },
  partnerIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  partnerInitial: { fontSize: 20, fontFamily: "Inter_700Bold" },
  partnerName: { fontSize: 13, fontFamily: "Inter_700Bold" },
  partnerOffer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  partnerPtsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  partnerPts: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  redeemBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginTop: 4 },
  redeemText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});
