import { useCallback } from "react";

import { simulateSmsAnalysis } from "@/lib/simulate";

export type SmsMessage = {
  address: string;
  body: string;
  date: number;
};

const DEMO_MESSAGES: SmsMessage[] = [
  {
    address: "MTN",
    body: "R49.99 deducted for iflix subscription. Reply STOP to cancel.",
    date: Date.now() - 3_600_000,
  },
  {
    address: "Capitec",
    body: "Loan repayment + interest of R87.50 charged to your account.",
    date: Date.now() - 7_200_000,
  },
  {
    address: "Vodacom",
    body: "Airtime advance approved. R32.40 service fee applied.",
    date: Date.now() - 10_800_000,
  },
  {
    address: "Capitec",
    body: "Deposit received. Available balance updated.",
    date: Date.now() - 14_400_000,
  },
];

export function useSms() {
  const requestPermissionAndRead = useCallback(async (): Promise<SmsMessage[]> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return DEMO_MESSAGES;
  }, []);

  const analyzeWithAI = useCallback(async (messages: SmsMessage[]) => {
    const bodies = messages.map((m) => m.body);
    return simulateSmsAnalysis(bodies);
  }, []);

  return { requestPermissionAndRead, analyzeWithAI };
}
