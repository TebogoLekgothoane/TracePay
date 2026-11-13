import type { LegalSection } from "@/lib/privacy";

/**
 * Terms of service, drafted from how TracePay actually works: statements you add, findings that
 * are information only, plans bought through the app stores. Anything only the business can
 * decide is written as [CONFIRM: ...] and shown highlighted. Have a South African lawyer review
 * the whole document (especially the Consumer Protection Act and cooling-off points) and remove
 * every marker before changing TERMS_STATUS to "published".
 */
export const TERMS_STATUS: "draft" | "published" = "draft";

export const TERMS_UPDATED = "[CONFIRM: date these terms take effect]";

export const TERMS_INTRO =
  "These terms are the agreement between you and TracePay for using our website and app. Please read them with our privacy policy. By creating an account or using TracePay, you agree to them. If you don’t agree, please don’t use TracePay.";

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    paragraphs: [
      "TracePay is run by [CONFIRM: registered company name and registration number] (“TracePay”, “we”, “us”), of [CONFIRM: registered address]. You can contact us at hello@tracepay.co.za.",
    ],
  },
  {
    id: "service",
    title: "What TracePay does",
    paragraphs: [
      "TracePay reads the bank statements and financial documents you add, lists the transactions in them, and points out patterns that may deserve a closer look, such as possible duplicate payments, bank fees, recurring charges and price increases.",
      "TracePay does not log into your bank, move money, make payments, or cancel anything for you. You act on a finding yourself.",
    ],
  },
  {
    id: "not-advice",
    title: "Information, not financial advice",
    paragraphs: [
      "Everything TracePay shows is information to help you understand your own finances. It is not financial, legal, tax or investment advice, and it is not a recommendation to switch banks, take credit, cancel a product or make any other financial decision. [CONFIRM: state whether TracePay is or is not an authorised financial services provider, and whether any licence applies.]",
      "A finding is a potential leak, not proof of a mistake or a saving. A statement can’t show whether you use a service or whether a charge was agreed, so please check before you act. We do not promise that you will save any amount.",
    ],
  },
  {
    id: "comparisons",
    title: "Comparison tables",
    paragraphs: [
      "Where TracePay shows options side by side, for example bank accounts, data bundles or ways to get cash, the prices come from published sources of different dates and are indicative. They change often, and your own price depends on your account or contract. Check the provider before you decide. Listing a provider is not an endorsement or a recommendation.",
    ],
  },
  {
    id: "account",
    title: "Your account",
    items: [
      "You must be 18 or older.",
      "Give us accurate information and keep it up to date.",
      "Keep your PIN, biometrics and device safe. You are responsible for what happens under your account, so tell us straight away if you think someone else has access.",
      "You may add only your own statements, or statements you are properly allowed to add.",
    ],
  },
  {
    id: "acceptable",
    title: "Using TracePay properly",
    paragraphs: ["Please don’t:"],
    items: [
      "break the law, or use TracePay to harm or deceive anyone;",
      "upload someone else’s financial information without their permission;",
      "try to get into parts of TracePay or other people’s accounts that you are not allowed to;",
      "copy, reverse-engineer or resell TracePay, or use it to build a competing product;",
      "overload or interfere with the service, including with automated tools.",
    ],
  },
  {
    id: "plans",
    title: "Plans and payment",
    items: [
      "The full financial analysis is a once-off purchase, currently R49. It unlocks every result for the analysis you bought. [CONFIRM: say whether it covers later statements.]",
      "Annual monitoring is currently R299 a year. It keeps watching new transactions and tells you about new potential leaks.",
      "Business and Accountant plans are not available yet. Their prices and features may change before launch.",
      "You pay through the App Store or Google Play, and they take payment and issue receipts. The annual plan renews every year until you cancel it in your store subscription settings, so cancel before the renewal date to avoid the next charge.",
      "Prices are in South African rand. [CONFIRM: say whether prices include VAT.] We may change prices for future purchases and renewals, and we will tell you before a renewal price changes.",
      "Refunds follow the store’s own rules. [CONFIRM: add any refund or cooling-off right the law gives you, and any refund you offer yourself.]",
    ],
  },
  {
    id: "your-data",
    title: "Your information",
    paragraphs: [
      "You own the statements and information you add. You allow TracePay to use them to provide the service, as our privacy policy explains. You can delete your account, and the statements and findings in it, in the app’s Settings or by emailing us.",
    ],
  },
  {
    id: "ip",
    title: "Our property",
    paragraphs: [
      "TracePay, its software, name, logo, designs and the way it analyses statements belong to us or our licensors. You may use TracePay for your own personal use as these terms allow, and you get no other rights in it.",
    ],
  },
  {
    id: "availability",
    title: "Availability and changes",
    paragraphs: [
      "We work to keep TracePay available and accurate, but we can’t promise it will always be uninterrupted or error-free. Statements can be formatted in ways we don’t read correctly, and some banks and formats may not be supported. We may change or stop features, and we will give reasonable notice of changes that matter.",
    ],
  },
  {
    id: "liability",
    title: "Our responsibility",
    paragraphs: [
      "Because TracePay gives information and not advice, we are not responsible for a decision you make using it, or for a saving you expected and did not get. [CONFIRM: lawyer to draft the limit on liability and check it against the Consumer Protection Act. It cannot exclude liability that the law does not allow to be excluded, such as for gross negligence or for harm to a consumer’s rights.]",
      "Nothing in these terms takes away any right you have under South African consumer law.",
    ],
  },
  {
    id: "ending",
    title: "Ending this agreement",
    paragraphs: [
      "You can stop using TracePay and delete your account at any time. Remember to cancel any subscription in your store settings, because deleting your account does not cancel a store subscription. We may suspend or close an account that breaks these terms or puts the service or other people at risk. [CONFIRM: say how a refund works if we close your account.]",
    ],
  },
  {
    id: "law",
    title: "Governing law and disputes",
    paragraphs: [
      "These terms are governed by the laws of South Africa. If we can’t settle a problem by talking, either of us may take it to a South African court with authority over it. [CONFIRM: name the court or any dispute process, and mention the ombud or consumer body you accept.]",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    paragraphs: [
      "We may update these terms. If a change matters, we will update the date above and tell you in the app or by email before it applies. If you keep using TracePay after that, you accept the new terms.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: ["Questions about these terms: hello@tracepay.co.za."],
  },
];
