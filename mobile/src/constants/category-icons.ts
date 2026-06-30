import { TransactionCategory } from "@/services/sms/sms.types";

export const CATEGORY_ICONS: Record<TransactionCategory, string> = {
  groceries: "cart-outline",
  fuel: "gas-station-outline",
  dining: "food-outline",
  entertainment: "television-play",
  utilities: "lightning-bolt-outline",
  transfer: "bank-transfer",
  atm: "cash",
  online: "web",
  medical: "hospital-box-outline",
  other: "dots-horizontal",
};
