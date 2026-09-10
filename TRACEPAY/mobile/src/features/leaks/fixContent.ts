import type { LucideIcon } from "lucide-react-native";
import {
  Banknote,
  Bell,
  Calendar,
  CreditCard,
  Landmark,
  MessageSquare,
  RefreshCw,
  Smartphone,
  Store,
  Wallet,
  Wifi,
} from "lucide-react-native";

import type { ImpactTone } from "../../theme/colors";

export type FixActionItem = {
  id: string;
  title: string;
  potentialSaving: string;
  Icon: LucideIcon;
  hasDetailFlow?: boolean;
};

export type FixSection = {
  title: string;
  actions: FixActionItem[];
};

export type FixFlowContent = {
  title: string;
  savings: string;
  impact: ImpactTone;
  sections: FixSection[];
  progressActions: FixActionItem[];
};

export type AccountOption = {
  id: string;
  name: string;
  mark: string;
  markColor: string;
  monthlyFee: string;
  tags: string[];
  featured?: boolean;
};

export type ComparisonRow = {
  label: string;
  values: [string, string, string];
};

export type GuideStep = {
  id: string;
  title: string;
  description: string;
};

export type ActionDetailContent = {
  title: string;
  subtitle: string;
  savings: string;
  savingsLabel: string;
  whyThisHelps: string;
  recommendedTitle: string;
  accounts?: AccountOption[];
  compareRows?: ComparisonRow[];
  topPick?: { name: string; description: string };
  guideTitle: string;
  guideSubtitle: string;
  steps: GuideStep[];
  helpTitle?: string;
  helpSubtitle?: string;
  successTitle: string;
  successSubtitle: string;
  nextSteps: string[];
  primaryCta: string;
  compareCta: string;
  guideCta: string;
  doneCta: string;
};

function guideAction(
  content: Omit<
    ActionDetailContent,
    "recommendedTitle" | "primaryCta" | "compareCta" | "guideCta" | "doneCta"
  > &
    Partial<
      Pick<
        ActionDetailContent,
        | "recommendedTitle"
        | "primaryCta"
        | "compareCta"
        | "guideCta"
        | "doneCta"
        | "accounts"
        | "compareRows"
        | "topPick"
      >
    >,
): ActionDetailContent {
  return {
    recommendedTitle: "What you'll do",
    primaryCta: "See step-by-step guide",
    compareCta: "Continue",
    guideCta: "I've completed these steps",
    doneCta: "Done",
    ...content,
  };
}

const FEES_ACTIONS: FixSection[] = [
  {
    title: "Easy to implement",
    actions: [
      {
        id: "account",
        title: "Switch to a lower-fee account",
        potentialSaving: "R165.00 /month",
        Icon: Wallet,
        hasDetailFlow: true,
      },
      {
        id: "sms",
        title: "Reduce SMS notifications",
        potentialSaving: "R72.00 /month",
        Icon: MessageSquare,
        hasDetailFlow: true,
      },
    ],
  },
  {
    title: "Medium effort",
    actions: [
      {
        id: "atm",
        title: "Use free ATM networks",
        potentialSaving: "R154.50 /month",
        Icon: Landmark,
        hasDetailFlow: true,
      },
    ],
  },
  {
    title: "Longer term",
    actions: [
      {
        id: "services",
        title: "Review account services",
        potentialSaving: "R248.40 /month",
        Icon: CreditCard,
        hasDetailFlow: true,
      },
    ],
  },
];

const SUBS_ACTIONS: FixSection[] = [
  {
    title: "Easy to implement",
    actions: [
      {
        id: "cancel",
        title: "Cancel unused subscriptions",
        potentialSaving: "R430.00 /month",
        Icon: RefreshCw,
        hasDetailFlow: true,
      },
      {
        id: "limits",
        title: "Set spending limits",
        potentialSaving: "R100.00 /month",
        Icon: Wallet,
        hasDetailFlow: true,
      },
    ],
  },
  {
    title: "Stay in control",
    actions: [
      {
        id: "alerts",
        title: "Get spending alerts",
        potentialSaving: "R50.00 /month",
        Icon: Bell,
        hasDetailFlow: true,
      },
    ],
  },
];

const DEBIT_ACTIONS: FixSection[] = [
  {
    title: "Easy to implement",
    actions: [
      {
        id: "pause",
        title: "Pause unused debit orders",
        potentialSaving: "R320.75 /month",
        Icon: Calendar,
        hasDetailFlow: true,
      },
      {
        id: "cancel-debit",
        title: "Cancel a debit order at your bank",
        potentialSaving: "R320.75 /month",
        Icon: CreditCard,
        hasDetailFlow: true,
      },
    ],
  },
  {
    title: "Stay in control",
    actions: [
      {
        id: "limits",
        title: "Set spending limits",
        potentialSaving: "R100.00 /month",
        Icon: Wallet,
        hasDetailFlow: true,
      },
    ],
  },
];

export const FIX_FLOW_CONTENT: Record<string, FixFlowContent> = {
  fees: {
    title: "How to fix",
    savings: "R712.50",
    impact: "high",
    sections: FEES_ACTIONS,
    progressActions: FEES_ACTIONS.flatMap((section) => section.actions),
  },
  subs: {
    title: "How to fix",
    savings: "R430.00",
    impact: "mediumWarm",
    sections: SUBS_ACTIONS,
    progressActions: SUBS_ACTIONS.flatMap((section) => section.actions),
  },
  debit: {
    title: "How to fix",
    savings: "R320.75",
    impact: "mediumCool",
    sections: DEBIT_ACTIONS,
    progressActions: DEBIT_ACTIONS.flatMap((section) => section.actions),
  },
  airtime: {
    title: "How to fix",
    savings: "R206.15",
    impact: "lowTeal",
    sections: [
      {
        title: "Easy to implement",
        actions: [
          {
            id: "bundle",
            title: "Switch to a better data bundle",
            potentialSaving: "R99.00 /month",
            Icon: Wifi,
            hasDetailFlow: true,
          },
          {
            id: "data-alerts",
            title: "Set data usage alerts",
            potentialSaving: "R40.00 /month",
            Icon: Bell,
            hasDetailFlow: true,
          },
        ],
      },
      {
        title: "Medium effort",
        actions: [
          {
            id: "wifi",
            title: "Use Wi-Fi where possible",
            potentialSaving: "R67.15 /month",
            Icon: Smartphone,
            hasDetailFlow: true,
          },
          {
            id: "topups",
            title: "Reduce ad-hoc top-ups",
            potentialSaving: "R40.00 /month",
            Icon: Banknote,
            hasDetailFlow: true,
          },
        ],
      },
    ],
    progressActions: [
      {
        id: "bundle",
        title: "Switch to a better data bundle",
        potentialSaving: "R99.00 /month",
        Icon: Wifi,
        hasDetailFlow: true,
      },
      {
        id: "data-alerts",
        title: "Set data usage alerts",
        potentialSaving: "R40.00 /month",
        Icon: Bell,
        hasDetailFlow: true,
      },
      {
        id: "wifi",
        title: "Use Wi-Fi where possible",
        potentialSaving: "R67.15 /month",
        Icon: Smartphone,
        hasDetailFlow: true,
      },
      {
        id: "topups",
        title: "Reduce ad-hoc top-ups",
        potentialSaving: "R40.00 /month",
        Icon: Banknote,
        hasDetailFlow: true,
      },
    ],
  },
  atm: {
    title: "How to fix",
    savings: "R150.00",
    impact: "lowBlue",
    sections: [
      {
        title: "Easy to implement",
        actions: [
          {
            id: "home-atm",
            title: "Use your bank's ATMs",
            potentialSaving: "R85.00 /month",
            Icon: Landmark,
            hasDetailFlow: true,
          },
          {
            id: "balance",
            title: "Skip paid balance checks",
            potentialSaving: "R30.00 /month",
            Icon: MessageSquare,
            hasDetailFlow: true,
          },
        ],
      },
      {
        title: "Medium effort",
        actions: [
          {
            id: "cashback",
            title: "Get cash back at stores",
            potentialSaving: "R35.00 /month",
            Icon: Store,
            hasDetailFlow: true,
          },
          {
            id: "card",
            title: "Pay by card instead",
            potentialSaving: "R30.00 /month",
            Icon: CreditCard,
            hasDetailFlow: true,
          },
        ],
      },
    ],
    progressActions: [
      {
        id: "home-atm",
        title: "Use your bank's ATMs",
        potentialSaving: "R85.00 /month",
        Icon: Landmark,
        hasDetailFlow: true,
      },
      {
        id: "balance",
        title: "Skip paid balance checks",
        potentialSaving: "R30.00 /month",
        Icon: MessageSquare,
        hasDetailFlow: true,
      },
      {
        id: "cashback",
        title: "Get cash back at stores",
        potentialSaving: "R35.00 /month",
        Icon: Store,
        hasDetailFlow: true,
      },
      {
        id: "card",
        title: "Pay by card instead",
        potentialSaving: "R30.00 /month",
        Icon: CreditCard,
        hasDetailFlow: true,
      },
    ],
  },
};

type CancelGuide = {
  name: string;
  amount: string;
  steps: GuideStep[];
  helpTitle: string;
  helpSubtitle: string;
};

const SUBSCRIPTION_CANCEL_GUIDES: Record<string, CancelGuide> = {
  netflix: {
    name: "Netflix",
    amount: "R159.00",
    helpTitle: "Need help cancelling Netflix?",
    helpSubtitle: "Use the Netflix website or app — cancellation takes about a minute.",
    steps: [
      {
        id: "1",
        title: "Open Netflix on the web or app",
        description:
          "Go to netflix.com and sign in, or open the Netflix app and tap your profile icon.",
      },
      {
        id: "2",
        title: "Open Account settings",
        description:
          "On the web: click your profile → Account. In the app: Profile → Account.",
      },
      {
        id: "3",
        title: "Choose Cancel Membership",
        description:
          "Under Membership & Billing, tap Cancel Membership (or Cancel plan).",
      },
      {
        id: "4",
        title: "Confirm cancellation",
        description:
          "Follow the prompts and confirm. You keep access until the end of the paid period.",
      },
      {
        id: "5",
        title: "Save the confirmation",
        description:
          "Screenshot the confirmation email or screen so you can prove the cancel date if charged again.",
      },
    ],
  },
  showmax: {
    name: "Showmax",
    amount: "R99.00",
    helpTitle: "Need help cancelling Showmax?",
    helpSubtitle: "Cancel from your Showmax account on the website or via your network.",
    steps: [
      {
        id: "1",
        title: "Sign in to Showmax",
        description: "Open showmax.com (or the Showmax app) and sign in with your account.",
      },
      {
        id: "2",
        title: "Go to Manage subscription",
        description:
          "Open Account / Settings and find Manage subscription or Billing.",
      },
      {
        id: "3",
        title: "Cancel your plan",
        description:
          "Select Cancel subscription and confirm. If you pay via Vodacom/MTN/Cell C, you may need to cancel the bundle on that network too.",
      },
      {
        id: "4",
        title: "Check your next billing date",
        description:
          "Note when access ends so you are not surprised by a final charge.",
      },
      {
        id: "5",
        title: "Watch your bank statement",
        description:
          "Confirm the debit stops next month. If it continues, dispute the debit with your bank.",
      },
    ],
  },
  spotify: {
    name: "Spotify Premium",
    amount: "R69.00",
    helpTitle: "Need help cancelling Spotify?",
    helpSubtitle: "Cancel on open.spotify.com — not only inside the phone app.",
    steps: [
      {
        id: "1",
        title: "Open Spotify on the web",
        description:
          "Go to open.spotify.com on a browser and log in (mobile browsers work too).",
      },
      {
        id: "2",
        title: "Open Account overview",
        description: "Click your profile picture → Account.",
      },
      {
        id: "3",
        title: "Manage your plan",
        description:
          "Under Your plan, choose Change plan or Cancel Premium / Cancel subscription.",
      },
      {
        id: "4",
        title: "Confirm and keep free access",
        description:
          "Confirm cancellation. Premium lasts until the end of the billing period, then you drop to Free.",
      },
      {
        id: "5",
        title: "If billed via Google/Apple",
        description:
          "Cancel in Google Play subscriptions or Apple Settings → Subscriptions instead of Spotify’s site.",
      },
    ],
  },
  adobe: {
    name: "Adobe Acrobat",
    amount: "R519.00",
    helpTitle: "Need help cancelling Adobe?",
    helpSubtitle: "Cancel from your Adobe account on account.adobe.com.",
    steps: [
      {
        id: "1",
        title: "Sign in to Adobe Account",
        description: "Go to account.adobe.com and sign in with the email on the subscription.",
      },
      {
        id: "2",
        title: "Open Plans & payments",
        description: "Select Plans and payment (or Manage plan).",
      },
      {
        id: "3",
        title: "Cancel the plan",
        description:
          "Choose Cancel plan and follow Adobe’s cancellation flow. Note any early-termination fee.",
      },
      {
        id: "4",
        title: "Download anything you need",
        description:
          "Export PDFs or files you still need before access ends.",
      },
      {
        id: "5",
        title: "Confirm the debit stops",
        description:
          "Check your next bank statement. Contact Adobe support if a charge still appears.",
      },
    ],
  },
  canva: {
    name: "Canva Pro",
    amount: "R599.00",
    helpTitle: "Need help cancelling Canva Pro?",
    helpSubtitle: "Cancel from canva.com → Billing.",
    steps: [
      {
        id: "1",
        title: "Open Canva settings",
        description: "Sign in at canva.com, open your account menu, then Settings.",
      },
      {
        id: "2",
        title: "Go to Billing",
        description: "Open Billing and find your Canva Pro / Teams subscription.",
      },
      {
        id: "3",
        title: "Cancel the subscription",
        description:
          "Select Cancel subscription and confirm. You keep Pro until the paid period ends.",
      },
      {
        id: "4",
        title: "Export Pro-only designs",
        description:
          "Download any designs that use Pro elements before access ends.",
      },
      {
        id: "5",
        title: "Verify no further charges",
        description: "Watch your card/bank for the next cycle to confirm cancellation.",
      },
    ],
  },
};

const DEBIT_PAUSE_GUIDES: Record<string, CancelGuide> = {
  dstv: {
    name: "DSTV Premium",
    amount: "R899.00",
    helpTitle: "Need help pausing DSTV?",
    helpSubtitle: "You can change or suspend via MultiChoice or your bank debit order.",
    steps: [
      {
        id: "1",
        title: "Decide: downgrade vs cancel",
        description:
          "If you still want TV, downgrade to a cheaper package first. If not, cancel or suspend.",
      },
      {
        id: "2",
        title: "Open MultiChoice / DStv account",
        description:
          "Sign in at dstv.com or the DStv app with your smartcard / account number.",
      },
      {
        id: "3",
        title: "Change or cancel your package",
        description:
          "Go to Manage package / Subscriptions and select Downgrade, Suspend, or Cancel.",
      },
      {
        id: "4",
        title: "Confirm the next debit date",
        description:
          "Note when the last debit will run so you know when the charge should stop.",
      },
      {
        id: "5",
        title: "Stop the bank debit if needed",
        description:
          "If MultiChoice still debits after cancel, open your banking app → Debit orders → Stop/cancel the DStv mandate.",
      },
    ],
  },
  gym: {
    name: "Gym membership",
    amount: "R450.00",
    helpTitle: "Need help cancelling a gym debit?",
    helpSubtitle: "Most gyms need written notice plus a bank debit-order stop.",
    steps: [
      {
        id: "1",
        title: "Check your contract notice period",
        description:
          "Look for 20–30 days’ written notice. Cancelling late can mean another debit.",
      },
      {
        id: "2",
        title: "Send a cancellation request",
        description:
          "Email or visit the gym with your full name, ID, membership number, and cancel date. Ask for written confirmation.",
      },
      {
        id: "3",
        title: "Return access cards if required",
        description:
          "Hand in tags/cards so the gym cannot claim you still used the facility.",
      },
      {
        id: "4",
        title: "Stop the debit order at your bank",
        description:
          "In your banking app: Payments → Debit orders → select the gym → Stop / Cancel mandate.",
      },
      {
        id: "5",
        title: "Watch the next statement",
        description:
          "If a debit still posts after your notice period, dispute it with the bank using the gym’s confirmation.",
      },
    ],
  },
  insurance: {
    name: "Insurance premium",
    amount: "R320.75",
    helpTitle: "Need help pausing an insurance debit?",
    helpSubtitle: "Always confirm cover ends in writing before you stop the debit.",
    steps: [
      {
        id: "1",
        title: "Confirm what the policy covers",
        description:
          "Call or message your insurer. Stopping cover without a replacement can leave you uninsured.",
      },
      {
        id: "2",
        title: "Request cancellation or pause in writing",
        description:
          "Ask for a cancellation/pause reference number and the date cover ends.",
      },
      {
        id: "3",
        title: "Get the final debit date",
        description:
          "Confirm whether a pro-rata or final premium will still be collected.",
      },
      {
        id: "4",
        title: "Stop the bank debit order",
        description:
          "After the insurer confirms, stop the mandate in your banking app under Debit orders.",
      },
      {
        id: "5",
        title: "Keep proof for 3 months",
        description:
          "Save emails/SMS confirmations in case a stray debit appears later.",
      },
    ],
  },
};

function buildCancelSubscriptionDetail(guide: CancelGuide): ActionDetailContent {
  return guideAction({
    title: `Cancel ${guide.name}`,
    subtitle: `Stop paying ${guide.amount} for ${guide.name} with these exact steps.`,
    savings: guide.amount,
    savingsLabel: "You can stop paying",
    whyThisHelps: `If you are not using ${guide.name}, cancelling stops the recurring charge before the next billing cycle. Follow each step in order and keep proof of cancellation.`,
    recommendedTitle: "Cancellation checklist",
    guideTitle: `How to cancel ${guide.name}`,
    guideSubtitle: "Do these steps in order. Most take under 5 minutes.",
    steps: guide.steps,
    helpTitle: guide.helpTitle,
    helpSubtitle: guide.helpSubtitle,
    successTitle: "Cancellation started",
    successSubtitle: `Once confirmed, ${guide.name} should stop billing after the current period.`,
    nextSteps: [
      "Watch your next bank statement",
      "Keep the confirmation screenshot",
      "Dispute any unexpected debit with your bank",
    ],
  });
}

function buildPauseDebitDetail(guide: CancelGuide): ActionDetailContent {
  return guideAction({
    title: `Stop ${guide.name}`,
    subtitle: `Follow these steps to pause or cancel the ${guide.amount} debit.`,
    savings: guide.amount,
    savingsLabel: "Potential monthly saving",
    whyThisHelps: `Unused or unwanted debit orders quietly drain your account. Stopping ${guide.name} the right way — with the provider and your bank — prevents surprise charges.`,
    recommendedTitle: "Stop-debit checklist",
    guideTitle: `How to stop ${guide.name}`,
    guideSubtitle: "Provider first, then your bank. Keep written proof.",
    steps: guide.steps,
    helpTitle: guide.helpTitle,
    helpSubtitle: guide.helpSubtitle,
    successTitle: "Stop request logged",
    successSubtitle: `Track the next cycle to confirm ${guide.name} no longer debits.`,
    nextSteps: [
      "Confirm with the provider in writing",
      "Stop the bank mandate if still active",
      "Check next month’s statement",
    ],
  });
}

export const ACTION_DETAILS: Record<string, ActionDetailContent> = {
  account: {
    title: "Switch to a lower-fee account",
    subtitle: "You could save R165 every month by moving to an account with lower fees.",
    savings: "R165.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Many people stay on legacy accounts with monthly fees they no longer need. A low-fee or zero-fee account can cut recurring charges without changing how you bank day to day.",
    recommendedTitle: "Recommended accounts",
    accounts: [
      {
        id: "nedbank",
        name: "Nedbank Savvy Plus",
        mark: "N",
        markColor: "success",
        monthlyFee: "R0.00",
        tags: ["Free card", "Low fees"],
        featured: true,
      },
      {
        id: "capitec",
        name: "Capitec Global One",
        mark: "C",
        markColor: "primary",
        monthlyFee: "R0.00",
        tags: ["Simple pricing", "No monthly fee"],
      },
      {
        id: "tyme",
        name: "TymeBank EveryDay",
        mark: "T",
        markColor: "warning",
        monthlyFee: "R0.00",
        tags: ["Digital first", "Free card"],
      },
    ],
    compareRows: [
      { label: "Monthly fee", values: ["R0.00", "R0.00", "R0.00"] },
      { label: "Card", values: ["Free", "Free", "Free"] },
      { label: "ATM withdrawals", values: ["Free at Nedbank", "Low cost", "Free at TymeBank"] },
      { label: "Online banking", values: ["Included", "Included", "Included"] },
      { label: "Debit orders", values: ["Free", "Free", "Free"] },
    ],
    topPick: {
      name: "Nedbank Savvy Plus",
      description: "Best match for your spending pattern and lowest overall fees.",
    },
    guideTitle: "How to switch accounts",
    guideSubtitle: "Follow these steps so nothing important gets left behind.",
    helpTitle: "Need help switching safely?",
    helpSubtitle: "Move money and debits before you close the old account.",
    steps: [
      {
        id: "1",
        title: "Open the new account online",
        description:
          "Apply in the bank’s app or website with your SA ID and a selfie. Approval is often same-day.",
      },
      {
        id: "2",
        title: "Verify your identity",
        description:
          "Upload your ID/passport and proof of address (municipal bill or bank statement under 3 months).",
      },
      {
        id: "3",
        title: "List every debit order on the old account",
        description:
          "In your current banking app, open Debit orders / Mandates and screenshot the full list.",
      },
      {
        id: "4",
        title: "Move debit orders and salary",
        description:
          "Update each provider (or use your bank’s switch service) and give payroll the new account number.",
      },
      {
        id: "5",
        title: "Transfer remaining funds, then close the old account",
        description:
          "Leave a small buffer for late debits, confirm nothing is pending, then request closure in-branch or in-app.",
      },
    ],
    successTitle: "Great choice!",
    successSubtitle: "You're on your way to saving R165.00 every month.",
    nextSteps: [
      "We'll remind you to move debit orders",
      "Track your progress in the app",
      "See savings add up on your dashboard",
    ],
    primaryCta: "Compare accounts",
    compareCta: "See switch steps",
    guideCta: "I've started switching",
    doneCta: "Done",
  },
  sms: guideAction({
    title: "Reduce SMS notifications",
    subtitle: "Stop paying for SMS alerts you can get free in the app.",
    savings: "R72.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Banks often charge per SMS for transaction alerts. Push notifications in the banking app cover the same alerts at no extra cost.",
    guideTitle: "How to turn off paid SMS alerts",
    guideSubtitle: "Switch to free app notifications in a few taps.",
    helpTitle: "Need help with alerts?",
    helpSubtitle: "Keep fraud alerts on — only drop marketing/transaction SMS fees.",
    steps: [
      {
        id: "1",
        title: "Open your banking app",
        description: "Sign in and go to Profile, Settings, or More.",
      },
      {
        id: "2",
        title: "Find Notifications or Alerts",
        description:
          "Look for Notification preferences, Alert settings, or Communication preferences.",
      },
      {
        id: "3",
        title: "Turn off SMS for routine transactions",
        description:
          "Disable SMS for purchases/transfers if app push is available. Keep SMS for login/OTP if required.",
      },
      {
        id: "4",
        title: "Enable push notifications",
        description:
          "Allow the banking app to send push alerts in your phone Settings → Notifications.",
      },
      {
        id: "5",
        title: "Confirm the fee stops",
        description:
          "Check next month’s bank charges for “SMS notification” or similar line items.",
      },
    ],
    successTitle: "Alerts updated",
    successSubtitle: "You're set to save about R72.00 a month on SMS fees.",
    nextSteps: [
      "Keep push notifications enabled",
      "Review fee line items next month",
      "Revisit alert settings anytime",
    ],
  }),
  atm: guideAction({
    title: "Use free ATM networks",
    subtitle: "Avoid other-bank ATM fees with these habits.",
    savings: "R154.50",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Withdrawing at another bank’s ATM often costs R8–R15 each time. Using your own bank’s ATMs — or cash back at till — cuts that fee almost to zero.",
    guideTitle: "How to avoid ATM fees",
    guideSubtitle: "Concrete steps to stop paying for cash.",
    helpTitle: "Need nearby free ATMs?",
    helpSubtitle: "Use your banking app’s ATM locator for fee-free machines.",
    steps: [
      {
        id: "1",
        title: "Open the ATM locator in your banking app",
        description: "Filter for your bank’s ATMs or partner fee-free network.",
      },
      {
        id: "2",
        title: "Save 2–3 nearby free ATMs",
        description: "Favourite locations you pass regularly (work, home, mall).",
      },
      {
        id: "3",
        title: "Withdraw less often, in larger amounts",
        description:
          "Plan weekly cash needs so you are not hit with multiple per-withdrawal fees.",
      },
      {
        id: "4",
        title: "Use till-point cash back when shopping",
        description:
          "At Checkers, Pick n Pay, Woolworths, etc., select cash back with a card purchase when free or cheaper than ATM fees.",
      },
      {
        id: "5",
        title: "Decline “other bank” ATMs",
        description:
          "If the machine warns about a fee, cancel and walk to your home-bank ATM instead.",
      },
    ],
    successTitle: "Fee-free cash plan set",
    successSubtitle: "You're on track to cut about R154.50 in ATM fees.",
    nextSteps: [
      "Use only saved free ATMs",
      "Prefer card or cash back",
      "Watch ATM fee lines disappear",
    ],
  }),
  services: guideAction({
    title: "Review account services",
    subtitle: "Turn off paid add-ons you never use.",
    savings: "R248.40",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Cheque books, paper statements, extra cards, and premium packages often bill monthly even when unused. Removing them is one of the fastest fee cuts.",
    guideTitle: "How to review and remove paid services",
    guideSubtitle: "Audit your account products, then cancel what you do not need.",
    helpTitle: "Not sure what a fee is?",
    helpSubtitle: "Match each charge on your statement to a product in the banking app.",
    steps: [
      {
        id: "1",
        title: "Download last month’s statement",
        description: "Highlight every fee line (monthly account, statements, cards, bundles).",
      },
      {
        id: "2",
        title: "Open Products / Manage account in the app",
        description: "Find linked products: extra cards, statements, overdraft, value bundles.",
      },
      {
        id: "3",
        title: "Cancel unused products",
        description:
          "Switch statements to free email/PDF, remove spare cards, and exit packages you do not use.",
      },
      {
        id: "4",
        title: "Confirm with the bank if needed",
        description:
          "Some products need a call or branch visit — ask for a reference number.",
      },
      {
        id: "5",
        title: "Re-check fees next month",
        description: "Verify the cancelled items no longer appear on your statement.",
      },
    ],
    successTitle: "Services reviewed",
    successSubtitle: "You're set up to save about R248.40 on account extras.",
    nextSteps: [
      "Keep e-statements only",
      "Skip unused value bundles",
      "Review fees quarterly",
    ],
  }),
  bundle: {
    title: "Switch to a better data bundle",
    subtitle: "You could save R99 every month by matching your bundle to actual usage.",
    savings: "R99.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Buying the wrong bundle — or topping up too often — adds up quickly. A bundle that fits your usage avoids out-of-bundle charges and impulse top-ups.",
    recommendedTitle: "Recommended bundles",
    accounts: [
      {
        id: "vodacom",
        name: "Vodacom 10GB",
        mark: "V",
        markColor: "destructive",
        monthlyFee: "R149.00",
        tags: ["Best value", "Rollover data"],
        featured: true,
      },
      {
        id: "mtn",
        name: "MTN 8GB",
        mark: "M",
        markColor: "warning",
        monthlyFee: "R139.00",
        tags: ["Night data", "Social bundles"],
      },
      {
        id: "cellc",
        name: "Cell C 6GB",
        mark: "C",
        markColor: "primary",
        monthlyFee: "R129.00",
        tags: ["Lower cost", "Flexible"],
      },
    ],
    compareRows: [
      { label: "Monthly cost", values: ["R149.00", "R139.00", "R129.00"] },
      { label: "Data included", values: ["10GB", "8GB", "6GB"] },
      { label: "Night data", values: ["Unlimited", "5GB", "None"] },
      { label: "Rollover", values: ["Yes", "Yes", "No"] },
    ],
    topPick: {
      name: "Vodacom 10GB",
      description: "Best fit for your current usage and lowest risk of out-of-bundle charges.",
    },
    guideTitle: "How to switch data bundles",
    guideSubtitle: "Check usage, pick a fit, then activate on your network.",
    helpTitle: "Need help activating a bundle?",
    helpSubtitle: "Use your network app or the USSD code printed on the offer.",
    steps: [
      {
        id: "1",
        title: "Check your last 3 months of usage",
        description:
          "In TracePay or your network app, note average GB used so you do not under-buy.",
      },
      {
        id: "2",
        title: "Pick a bundle that covers average use",
        description:
          "Choose slightly above your average to avoid out-of-bundle rates.",
      },
      {
        id: "3",
        title: "Open your network app or dial USSD",
        description:
          "Vodacom (*135#), MTN (*136#), Cell C (*147#) — or use the official app store listing.",
      },
      {
        id: "4",
        title: "Activate the new bundle and confirm SMS",
        description:
          "Complete purchase and save the confirmation SMS with the expiry date.",
      },
      {
        id: "5",
        title: "Turn on data usage alerts",
        description:
          "In the network app, set a warning at 80% usage so you can top up intentionally.",
      },
    ],
    successTitle: "Smart move!",
    successSubtitle: "You're on your way to saving R99.00 every month on data.",
    nextSteps: [
      "We'll track your data spending",
      "Alert you before out-of-bundle charges",
      "Suggest better bundles over time",
    ],
    primaryCta: "Compare bundles",
    compareCta: "See activation steps",
    guideCta: "I've activated my bundle",
    doneCta: "Done",
  },
  "home-atm": {
    title: "Use your bank's ATMs",
    subtitle: "You could save R85 every month by avoiding other bank ATM fees.",
    savings: "R85.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Withdrawing at another bank's ATM often costs R8–R15 per withdrawal. Using your home bank's network — or getting cash back at a store — keeps more money in your pocket.",
    recommendedTitle: "Free ATM options near you",
    accounts: [
      {
        id: "nedbank",
        name: "Nedbank ATM · Sandton City",
        mark: "N",
        markColor: "success",
        monthlyFee: "Free",
        tags: ["0.4 km away", "No fee"],
        featured: true,
      },
      {
        id: "capitec",
        name: "Capitec ATM · Rosebank",
        mark: "C",
        markColor: "primary",
        monthlyFee: "Free",
        tags: ["1.2 km away", "Partner network"],
      },
    ],
    guideTitle: "How to avoid ATM fees",
    guideSubtitle: "Simple habits that cut withdrawal costs.",
    helpTitle: "Need a free ATM nearby?",
    helpSubtitle: "Open your banking app’s ATM map and filter for fee-free machines.",
    steps: [
      {
        id: "1",
        title: "Find free ATMs nearby",
        description: "Use the map in your banking app and filter for your bank only.",
      },
      {
        id: "2",
        title: "Plan cash withdrawals",
        description: "Withdraw once a week in a larger amount instead of many small ones.",
      },
      {
        id: "3",
        title: "Try cash back at stores",
        description: "Ask for cash back at the till when you already pay by card.",
      },
      {
        id: "4",
        title: "Pay by card where possible",
        description: "Reduce how much cash you need day to day.",
      },
      {
        id: "5",
        title: "Decline fee warnings",
        description: "If another bank’s ATM shows a fee screen, cancel and move on.",
      },
    ],
    successTitle: "Nice work!",
    successSubtitle: "You're on your way to saving R85.00 every month on ATM fees.",
    nextSteps: [
      "We'll show free ATMs near you",
      "Alert you about costly withdrawals",
      "Track your fee savings",
    ],
    primaryCta: "Find free ATMs",
    compareCta: "View on map",
    guideCta: "I'll use free ATMs",
    doneCta: "Done",
  },
  wifi: guideAction({
    title: "Use Wi-Fi where possible",
    subtitle: "Cut mobile data by connecting at home, work, and trusted spots.",
    savings: "R67.15",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Streaming and updates on mobile data burn through bundles. Auto-joining trusted Wi-Fi keeps expensive cellular data for when you truly need it.",
    guideTitle: "How to use Wi-Fi more and mobile data less",
    guideSubtitle: "Phone settings that protect your bundle.",
    helpTitle: "Worried about public Wi-Fi?",
    helpSubtitle: "Prefer home/work Wi-Fi; use mobile data for banking on public networks.",
    steps: [
      {
        id: "1",
        title: "Turn on Auto-join for home and work Wi-Fi",
        description: "In phone Wi-Fi settings, enable Auto-Join for trusted networks.",
      },
      {
        id: "2",
        title: "Restrict background data on cellular",
        description:
          "On Android: Data usage → restrict background data for heavy apps. On iPhone: Cellular → turn off data for apps that can wait for Wi-Fi.",
      },
      {
        id: "3",
        title: "Download offline content on Wi-Fi",
        description:
          "Download playlists, maps, and shows before you leave home.",
      },
      {
        id: "4",
        title: "Disable auto-play on social apps",
        description:
          "In Instagram/TikTok/Facebook, set videos to Wi-Fi only where available.",
      },
      {
        id: "5",
        title: "Update apps and OS on Wi-Fi only",
        description:
          "App Store / Play Store → set auto-updates to Wi-Fi only.",
      },
    ],
    successTitle: "Wi-Fi habits set",
    successSubtitle: "You're lined up to save about R67.15 on mobile data.",
    nextSteps: [
      "Keep auto-join on for trusted Wi-Fi",
      "Update apps only on Wi-Fi",
      "Watch data usage drop",
    ],
  }),
  "data-alerts": guideAction({
    title: "Set data usage alerts",
    subtitle: "Get warned before you hit expensive out-of-bundle rates.",
    savings: "R40.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Out-of-bundle data is far more expensive than prepaid bundles. Alerts at 50% and 80% give you time to buy more data deliberately.",
    guideTitle: "How to set data usage alerts",
    guideSubtitle: "Turn on warnings in your phone and network app.",
    helpTitle: "Alerts not arriving?",
    helpSubtitle: "Allow SMS/push from your network and check Do Not Disturb settings.",
    steps: [
      {
        id: "1",
        title: "Open your network’s app",
        description: "Vodacom, MTN, Cell C, or Telkom — sign in to your number.",
      },
      {
        id: "2",
        title: "Find Usage or Spend limits",
        description: "Look for Data usage alerts, Balance notifications, or Spend manager.",
      },
      {
        id: "3",
        title: "Set alerts at 50% and 80%",
        description: "Enable SMS or push when you cross those thresholds.",
      },
      {
        id: "4",
        title: "Add a phone-level data warning",
        description:
          "Android: Settings → Network → Data warning. iPhone: Settings → Mobile Data → check usage regularly or use Screen Time limits.",
      },
      {
        id: "5",
        title: "Decide your top-up rule",
        description:
          "When alerted, buy a small top-up on Wi-Fi instead of continuing out-of-bundle.",
      },
    ],
    successTitle: "Alerts are on",
    successSubtitle: "You're better protected from surprise data charges.",
    nextSteps: [
      "Act on 80% alerts quickly",
      "Top up intentionally",
      "Review usage weekly",
    ],
  }),
  alerts: guideAction({
    title: "Get spending alerts",
    subtitle: "Be notified when a new subscription or unusual debit posts.",
    savings: "R50.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Early alerts let you cancel a trial or unknown debit before it becomes a habit. Pair bank push alerts with TracePay’s leak list.",
    guideTitle: "How to turn on spending alerts",
    guideSubtitle: "Enable bank notifications for new merchants and large debits.",
    helpTitle: "Too many alerts?",
    helpSubtitle: "Keep alerts for new merchants and amounts over your chosen limit only.",
    steps: [
      {
        id: "1",
        title: "Open notification settings in your banking app",
        description: "Go to Profile → Settings → Notifications / Alerts.",
      },
      {
        id: "2",
        title: "Enable push for card and debit-order activity",
        description: "Turn on alerts for purchases, recurring payments, and failed debits.",
      },
      {
        id: "3",
        title: "Set a minimum amount threshold",
        description: "e.g. notify for anything above R50 so small noise does not overwhelm you.",
      },
      {
        id: "4",
        title: "Allow the banking app in phone notifications",
        description: "Phone Settings → Notifications → your bank → Allow alerts.",
      },
      {
        id: "5",
        title: "Act the same day on unknown merchants",
        description:
          "If you see a new subscription name, open TracePay → Leaks and start the cancel guide.",
      },
    ],
    successTitle: "Spending alerts on",
    successSubtitle: "New subscriptions are harder to miss.",
    nextSteps: [
      "Keep bank push enabled",
      "Cancel unknown merchants quickly",
      "Review TracePay leaks weekly",
    ],
  }),
  topups: guideAction({
    title: "Reduce ad-hoc top-ups",
    subtitle: "Replace impulse airtime buys with a planned monthly bundle.",
    savings: "R40.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Small top-ups throughout the month usually cost more than one right-sized bundle. Planning removes panic purchases at out-of-bundle rates.",
    guideTitle: "How to stop impulse top-ups",
    guideSubtitle: "Set a monthly data budget and stick to it.",
    helpTitle: "Still topping up mid-month?",
    helpSubtitle: "Your base bundle may be too small — size up once, not five times.",
    steps: [
      {
        id: "1",
        title: "Total last month’s airtime/data spend",
        description: "Add every top-up in TracePay or your bank feed.",
      },
      {
        id: "2",
        title: "Choose one monthly bundle that covers it",
        description: "Buy once at the start of the cycle instead of many small packs.",
      },
      {
        id: "3",
        title: "Turn on auto-renew only if usage is stable",
        description: "Otherwise set a calendar reminder to review before renewing.",
      },
      {
        id: "4",
        title: "Remove saved airtime shortcuts",
        description:
          "Delete one-tap top-up widgets/favourites that make impulse buys too easy.",
      },
      {
        id: "5",
        title: "Use Wi-Fi before buying emergency data",
        description: "Connect to Wi-Fi first; only top up if you still need mobile data.",
      },
    ],
    successTitle: "Top-up plan set",
    successSubtitle: "You're positioned to cut about R40.00 in impulse buys.",
    nextSteps: [
      "Buy one monthly bundle",
      "Ignore mid-month panic top-ups",
      "Review spend next month",
    ],
  }),
  balance: guideAction({
    title: "Skip paid balance checks",
    subtitle: "Stop paying ATMs or USSD fees just to see your balance.",
    savings: "R30.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Balance enquiries at ATMs or some USSD channels can cost a few rand each. Your banking app shows the same balance for free.",
    guideTitle: "How to check your balance for free",
    guideSubtitle: "Use the app (or free channels) every time.",
    helpTitle: "App not updating?",
    helpSubtitle: "Pull to refresh or open recent transactions — still free vs ATM enquiry.",
    steps: [
      {
        id: "1",
        title: "Open your banking app for balances",
        description: "Make this your default instead of ATM “balance enquiry”.",
      },
      {
        id: "2",
        title: "Enable biometric login",
        description: "Faster than card + PIN at a machine when you only need the balance.",
      },
      {
        id: "3",
        title: "Turn on free balance notifications",
        description:
          "If your bank offers free push after transactions, enable it and skip paid SMS.",
      },
      {
        id: "4",
        title: "Decline ATM balance screens",
        description: "When withdrawing, choose “no receipt” / skip balance if it adds a fee.",
      },
      {
        id: "5",
        title: "Use TracePay for a daily snapshot",
        description: "Check the home balance here before you head out for cash.",
      },
    ],
    successTitle: "Free balance habit set",
    successSubtitle: "You're set to avoid about R30.00 in enquiry fees.",
    nextSteps: [
      "Use the banking app only",
      "Skip ATM balance prompts",
      "Watch enquiry fees disappear",
    ],
  }),
  cashback: guideAction({
    title: "Get cash back at stores",
    subtitle: "Take cash at the till instead of paying other-bank ATM fees.",
    savings: "R35.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Many SA retailers let you add cash back when you pay by debit card — often cheaper than a foreign ATM fee.",
    guideTitle: "How to get cash back at the till",
    guideSubtitle: "Use everyday shopping trips to withdraw cash fee-free.",
    helpTitle: "Till declined cash back?",
    helpSubtitle: "Try another store or a smaller amount; limits vary by retailer.",
    steps: [
      {
        id: "1",
        title: "Shop at a store that offers cash back",
        description: "Common options: Checkers, Pick n Pay, Spar, Woolworths, some petrol stations.",
      },
      {
        id: "2",
        title: "Pay by debit card and request cash back",
        description: "Tell the cashier the cash amount before they finalise the sale.",
      },
      {
        id: "3",
        title: "Stay within the till limit",
        description: "Limits are often R500–R2000 — split across trips if you need more.",
      },
      {
        id: "4",
        title: "Check your banking app for any fee",
        description: "Most cash-back transactions are free; note if your bank charges.",
      },
      {
        id: "5",
        title: "Prefer this over other-bank ATMs",
        description: "Make cash back your default when you already need groceries.",
      },
    ],
    successTitle: "Cash-back habit set",
    successSubtitle: "You're ready to save about R35.00 vs paid ATM withdrawals.",
    nextSteps: [
      "Request cash back while shopping",
      "Avoid foreign ATMs",
      "Track fee savings monthly",
    ],
  }),
  card: guideAction({
    title: "Pay by card instead",
    subtitle: "Need less cash — and fewer ATM trips — by tapping or swiping.",
    savings: "R30.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Every rand you pay by card is a rand you do not withdraw (and potentially pay fees on). Card payments also leave a clearer spending trail in TracePay.",
    guideTitle: "How to rely less on cash",
    guideSubtitle: "Build a card-first routine for daily spend.",
    helpTitle: "Merchant cash-only?",
    helpSubtitle: "Keep a small cash float; use free ATMs or cash back only for that float.",
    steps: [
      {
        id: "1",
        title: "Enable tap-to-pay / card controls",
        description: "Turn on contactless in your banking app and set a sensible daily limit.",
      },
      {
        id: "2",
        title: "Add your card to Google Pay or Apple Pay",
        description: "So you can pay even if you forget the physical card.",
      },
      {
        id: "3",
        title: "Use card for transport and groceries first",
        description: "These are the highest-frequency cash categories for most people.",
      },
      {
        id: "4",
        title: "Keep only a small cash emergency float",
        description: "Withdraw once via a free ATM or cash back — not daily.",
      },
      {
        id: "5",
        title: "Review cash withdrawals in TracePay weekly",
        description: "If cash spikes, switch another category to card next week.",
      },
    ],
    successTitle: "Card-first plan set",
    successSubtitle: "Fewer withdrawals means roughly R30.00 less in related fees.",
    nextSteps: [
      "Tap for everyday purchases",
      "Keep a small cash float only",
      "Review withdrawals weekly",
    ],
  }),
  cancel: guideAction({
    title: "Cancel unused subscriptions",
    subtitle: "Stop paying for services you barely open.",
    savings: "R430.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Forgotten subscriptions renew automatically. Cancelling each one in the provider’s account — then confirming the bank debit stops — is the only reliable fix.",
    guideTitle: "How to cancel unused subscriptions",
    guideSubtitle: "Work through each service, then verify your bank feed.",
    helpTitle: "Not sure where you subscribed?",
    helpSubtitle: "Check email receipts, app stores, and your banking merchant names.",
    steps: [
      {
        id: "1",
        title: "List every active subscription in TracePay",
        description: "Open Money leaks → Subscriptions and note name, amount, and billing date.",
      },
      {
        id: "2",
        title: "Open each service’s account settings",
        description:
          "Cancel inside Netflix, Showmax, Spotify, Adobe, Canva, etc. — not only by ignoring the debit.",
      },
      {
        id: "3",
        title: "Confirm cancellation and keep proof",
        description: "Screenshot the confirmation page or email for each service.",
      },
      {
        id: "4",
        title: "Cancel app-store billings if needed",
        description:
          "Google Play → Payments & subscriptions, or iPhone Settings → Subscriptions.",
      },
      {
        id: "5",
        title: "Verify the next statement is clean",
        description:
          "If a charge still appears, dispute it with your bank using your cancellation proof.",
      },
    ],
    successTitle: "Cancellation plan ready",
    successSubtitle: "Work through each unused sub to reclaim up to R430.00.",
    nextSteps: [
      "Cancel one subscription today",
      "Save confirmations",
      "Recheck next month’s statement",
    ],
  }),
  limits: guideAction({
    title: "Set spending limits",
    subtitle: "Cap categories so new subscriptions and debits cannot run wild.",
    savings: "R100.00",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Spending limits and merchant blocks stop surprise renewals and impulse sign-ups before they hit your account.",
    guideTitle: "How to set spending limits",
    guideSubtitle: "Use your banking app’s controls and TracePay reminders.",
    helpTitle: "Bank missing category limits?",
    helpSubtitle: "Set a monthly transfer to a “bills” pocket and only fund subs from there.",
    steps: [
      {
        id: "1",
        title: "Open card controls in your banking app",
        description: "Find Spend limits, Card controls, or Budgets.",
      },
      {
        id: "2",
        title: "Set a monthly entertainment / subs limit",
        description: "Pick an amount you can afford (e.g. R200) for streaming and apps.",
      },
      {
        id: "3",
        title: "Enable transaction alerts above that limit",
        description: "Get push/SMS when a merchant tries to charge more.",
      },
      {
        id: "4",
        title: "Block new international or online merchants if needed",
        description: "Temporarily lock online payments when you are not shopping.",
      },
      {
        id: "5",
        title: "Review limits monthly in TracePay",
        description: "Adjust after you cancel unused services so the cap stays realistic.",
      },
    ],
    successTitle: "Limits in place",
    successSubtitle: "New spend is less likely to surprise you.",
    nextSteps: [
      "Keep alerts on",
      "Review caps monthly",
      "Cancel anything that breaches the limit",
    ],
  }),
  pause: guideAction({
    title: "Pause unused debit orders",
    subtitle: "Stop or suspend debits you do not need this month.",
    savings: "R320.75",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "Debit orders renew until you cancel with the provider and stop the bank mandate. Doing both prevents “zombie” charges.",
    guideTitle: "How to pause or stop a debit order",
    guideSubtitle: "Provider first, then your banking app.",
    helpTitle: "Bank won’t stop the debit?",
    helpSubtitle: "Ask for a mandate cancellation reference and escalate with proof from the provider.",
    steps: [
      {
        id: "1",
        title: "Identify the debit in TracePay / your statement",
        description: "Note the merchant name, amount, and usual debit date.",
      },
      {
        id: "2",
        title: "Contact the provider to cancel or pause",
        description:
          "Use their app, website, or support line. Get a reference number and end date in writing.",
      },
      {
        id: "3",
        title: "Open Debit orders in your banking app",
        description:
          "Typical path: Payments → Debit orders / Mandates → select the merchant.",
      },
      {
        id: "4",
        title: "Stop or suspend the mandate",
        description:
          "Choose Stop / Cancel / Suspend. Confirm any notice period the bank shows.",
      },
      {
        id: "5",
        title: "Monitor the next two statement cycles",
        description:
          "If a debit still posts, dispute it immediately with your cancellation proof.",
      },
    ],
    successTitle: "Pause plan ready",
    successSubtitle: "Follow the steps to reclaim up to R320.75 in debit orders.",
    nextSteps: [
      "Cancel with the provider today",
      "Stop the bank mandate",
      "Verify next month’s statement",
    ],
  }),
  "cancel-debit": guideAction({
    title: "Cancel a debit order at your bank",
    subtitle: "Use your banking app to stop the mandate even if the merchant is slow.",
    savings: "R320.75",
    savingsLabel: "Potential saving",
    whyThisHelps:
      "South African banks let you stop debit-order mandates in-app. Pair this with a provider cancel so they do not restart the mandate later.",
    guideTitle: "How to cancel a debit order in your banking app",
    guideSubtitle: "Exact path varies slightly by bank — look for Debit orders or Mandates.",
    helpTitle: "Cannot find debit orders?",
    helpSubtitle: "Search the app for “mandate”, “debit order”, or call the bank’s stop-order line.",
    steps: [
      {
        id: "1",
        title: "Sign in to online banking or the app",
        description: "Use the profile that owns the account being debited.",
      },
      {
        id: "2",
        title: "Open Debit orders / Stop orders / Mandates",
        description:
          "Often under Payments, Transact, or Account settings.",
      },
      {
        id: "3",
        title: "Select the merchant debit",
        description: "Match the name and amount from your TracePay leak list.",
      },
      {
        id: "4",
        title: "Choose Stop / Cancel and confirm",
        description:
          "Read any warning about future collections, then confirm with OTP or biometric.",
      },
      {
        id: "5",
        title: "Tell the merchant you stopped the debit",
        description:
          "So they close your account cleanly and do not send collectors for a “failed” debit.",
      },
    ],
    successTitle: "Bank stop requested",
    successSubtitle: "Confirm on your next statement that the debit is gone.",
    nextSteps: [
      "Save the bank confirmation",
      "Notify the merchant",
      "Dispute any late debit",
    ],
  }),
};

for (const [id, guide] of Object.entries(SUBSCRIPTION_CANCEL_GUIDES)) {
  ACTION_DETAILS[`cancel-${id}`] = buildCancelSubscriptionDetail(guide);
}

for (const [id, guide] of Object.entries(DEBIT_PAUSE_GUIDES)) {
  ACTION_DETAILS[`pause-${id}`] = buildPauseDebitDetail(guide);
}

export function getFixContent(leakId: string): FixFlowContent | null {
  return FIX_FLOW_CONTENT[leakId] ?? null;
}

export function getActionDetail(actionId: string): ActionDetailContent | null {
  return ACTION_DETAILS[actionId] ?? null;
}

export function hasCompareFlow(detail: ActionDetailContent): boolean {
  return Boolean(detail.compareRows?.length);
}

/** Prefer the step-by-step guide unless the action needs a comparison first. */
export function getFixRoute(leakId: string, actionId: string): string {
  const detail = getActionDetail(actionId);
  if (!detail) {
    return `/leak/${leakId}/fix`;
  }
  if (hasCompareFlow(detail)) {
    return `/leak/${leakId}/fix/${actionId}`;
  }
  return `/leak/${leakId}/fix/${actionId}/guide`;
}

export function getPrimaryFixActionId(leakId: string): string | null {
  const content = getFixContent(leakId);
  return content?.sections[0]?.actions[0]?.id ?? null;
}

export function getCompletedActions(leakId: string): string[] {
  if (leakId === "fees") return ["account"];
  if (leakId === "airtime") return [];
  if (leakId === "atm") return [];
  if (leakId === "subs") return [];
  if (leakId === "debit") return [];
  return [];
}
