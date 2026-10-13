/** Shared copy for the financial-data consent gate and full consent form. */

export const CONSENT_SUBTITLE =
  "We value your privacy and only use the financial data you choose to share.";

export const CONSENT_SECTIONS = [
  {
    id: "access",
    title: "Data we access",
    summary: "Bank statements you upload, plus your TracePay account details.",
    details: [
      "Transaction dates, descriptions, amounts and balances from statements you choose.",
      "Never your banking passwords, PINs, or one-time passwords.",
    ],
  },
  {
    id: "why",
    title: "Why we need this",
    summary: "To spot hidden fees, show your spending, and alert you to money leaks.",
    details: [
      "To spot hidden fees and zombie subscriptions.",
      "To show spending from your real transactions.",
      "To alert you to new money leaks.",
    ],
  },
  {
    id: "not",
    title: "What we do not do",
    summary: "We never sell your data or move your money.",
    details: [
      "Never sell your financial data.",
      "Never log into your bank or ask for bank passwords.",
      "Never move money or make payments for you.",
    ],
  },
] as const;

export const CONSENT_FORM_SECTIONS = [
  {
    id: "purpose",
    title: "What TracePay does",
    body: "You upload your own bank statement PDF. TracePay reads it, lists transactions, and helps you spot possible recurring charges, bank fees, unexplained deductions, and other money leaks — with guidance you can act on yourself.",
  },
  {
    id: "not",
    title: "What we never do",
    body: "We do not log into your bank, move money, cancel debit orders for you, or ask for bank login passwords, bank PINs, bank one-time passwords, or full card security codes. We do not sell your financial data.",
  },
  {
    id: "collect",
    title: "What we access",
    body: "Names and contact details for your account; consent records; bank statements and financial documents you choose to upload; transaction dates, descriptions, amounts and balances; categories, analysis results and potential leak findings; and application logs needed to run and protect the service.",
  },
  {
    id: "why",
    title: "Why we need it",
    body: "To show your transactions, surface possible money leaks, keep your account secure, and improve the service with feedback you choose to share.",
  },
  {
    id: "control",
    title: "Your control",
    body: "Participation is voluntary. Consent starts unticked — nothing is assumed. You choose which statements to upload. You can withdraw and request deletion at any time via Settings or by contacting TracePay support.",
  },
  {
    id: "advice",
    title: "Not financial advice",
    body: "Insights from TracePay are informational. They are not a recommendation to switch banks, take credit, cancel products, or make any specific financial decision.",
  },
] as const;

export const CONSENT_CHECKBOX = {
  privacyPrefix: "I have read and understood the",
  privacyLink: "full consent form",
  processing:
    "I consent to TracePay collecting and processing my financial data as described above.",
  agreeLabel: "Agree & continue",
} as const;
