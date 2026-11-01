import { CreditCard, Landmark, RefreshCw, Smartphone } from "lucide-react-native";

import type { LeakPreview } from "../../components/dashboard/LeakSummary";

/** Leak categories shown on Home and on the Leaks tab. */
export const LEAK_CATEGORIES: LeakPreview[] = [
  {
    id: "fees",
    title: "Bank fees",
    amount: "R712.50",
    change: "↑ 18%",
    changeDirection: "up",
    Icon: Landmark,
    iconTone: "solid",
    tint: "#8B5CF6",
    tintBg: "transparent",
    merchants: [],
  },
  {
    id: "subs",
    title: "Subscriptions",
    amount: "R430.00",
    change: "↑ 8%",
    changeDirection: "up",
    Icon: RefreshCw,
    iconTone: "solid",
    tint: "#F97316",
    tintBg: "transparent",
    merchants: [
      { id: "netflix", name: "Netflix", logoDomain: "netflix.com" },
      { id: "spotify", name: "Spotify", logoDomain: "spotify.com" },
      { id: "youtube", name: "YouTube", logoDomain: "youtube.com" },
    ],
    moreCount: 3,
  },
  {
    id: "airtime",
    title: "Airtime & Data",
    amount: "R285.00",
    change: "↓ 12%",
    changeDirection: "down",
    Icon: Smartphone,
    iconTone: "solid",
    tint: "#EAB308",
    tintBg: "transparent",
    merchants: [
      { id: "mtn", name: "MTN", logoDomain: "mtn.co.za" },
      { id: "vodacom", name: "Vodacom", logoDomain: "vodacom.co.za" },
      { id: "cellc", name: "Cell C", logoDomain: "cellc.co.za" },
    ],
  },
  {
    id: "debit",
    title: "Debit orders",
    amount: "R320.75",
    change: "↑ 5%",
    changeDirection: "up",
    Icon: CreditCard,
    iconTone: "solid",
    tint: "#2563EB",
    tintBg: "transparent",
    merchants: [{ id: "dstv", name: "DStv", logoDomain: "dstv.com" }],
    moreCount: 2,
  },
];
