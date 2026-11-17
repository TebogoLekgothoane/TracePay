import { CreditCard, Landmark, RefreshCw, Smartphone } from "lucide-react-native";

import type { LeakPreview } from "../../components/dashboard/LeakSummary";

/**
 * Visual metadata for the leak categories (icon, colour). Amounts, change labels and merchant
 * logos are filled in from the user's own findings in leak-categories.live.ts, never from here.
 */
export const LEAK_CATEGORIES: LeakPreview[] = [
  {
    id: "fees",
    title: "Bank fees",
    amount: "R0.00",
    change: "",
    changeDirection: "down",
    Icon: Landmark,
    iconTone: "solid",
    tint: "#6D3FE0",
    tintBg: "transparent",
    merchants: [],
  },
  {
    id: "subs",
    title: "Recurring Payments",
    amount: "R0.00",
    change: "",
    changeDirection: "down",
    Icon: RefreshCw,
    iconTone: "solid",
    tint: "#F97316",
    tintBg: "transparent",
    merchants: [],
  },
  {
    id: "airtime",
    title: "Airtime & Data",
    amount: "R0.00",
    change: "",
    changeDirection: "down",
    Icon: Smartphone,
    iconTone: "solid",
    tint: "#EAB308",
    tintBg: "transparent",
    merchants: [],
  },
  {
    id: "debit",
    title: "Debit orders",
    amount: "R0.00",
    change: "",
    changeDirection: "down",
    Icon: CreditCard,
    iconTone: "solid",
    tint: "#2563EB",
    tintBg: "transparent",
    merchants: [],
  },
];
