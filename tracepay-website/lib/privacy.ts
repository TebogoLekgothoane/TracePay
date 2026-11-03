/**
 * Privacy policy text, drafted from what the TracePay app and website actually do and from the
 * promises in the app's own consent screen. Anything only the business can know is written as
 * [CONFIRM: ...] and shown highlighted on the page. Remove every marker, and have a South African
 * lawyer review the whole document, before changing PRIVACY_STATUS to "published".
 */
export const PRIVACY_STATUS: "draft" | "published" = "draft";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  /** Short text shown after the list. */
  after?: string;
};

export const PRIVACY_UPDATED = "[CONFIRM: date this policy takes effect]";

export const PRIVACY_INTRO =
  "This policy explains what personal information TracePay collects when you visit our website or use our app, why we collect it, who we share it with and what rights you have. We write it to meet South Africa’s Protection of Personal Information Act, 2013 (POPIA).";

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    paragraphs: [
      "The responsible party for your personal information is [CONFIRM: registered company name and registration number] (“TracePay”, “we”, “us”), of [CONFIRM: registered address].",
      "Our Information Officer is [CONFIRM: name]. You can reach us about anything in this policy at hello@tracepay.co.za.",
    ],
  },
  {
    id: "collect",
    title: "What we collect on this website",
    items: [
      "If you join the waitlist: your email address, the plans you said you’re interested in, and the time you agreed to be emailed.",
      "Your light or dark display choice, kept in your own browser. We don’t use advertising trackers. [CONFIRM: update this if you add website analytics.]",
    ],
  },
  {
    id: "collect-app",
    title: "What we collect in the app",
    items: [
      "Your account details: your email address or phone number, and your name if you give it.",
      "Bank statements and other financial documents you choose to upload, and the transactions we read from them: dates, descriptions, amounts, balances, merchant names, and the type and last four digits of an account.",
      "What TracePay works out from them: categories, recurring payments, fees and potential leak findings, and the answers you give to questions about a finding.",
      "On Android, only if you allow it: bank SMS messages and notifications that you give TracePay access to. [CONFIRM: describe exactly which SMS and notifications are read and kept.]",
      "Your consent records, and your purchase status. The App Store or Google Play handles your payment. We are told that you bought a plan and when it ends, not your card details.",
      "Technical logs we need to run and protect the service, such as errors and security events.",
    ],
  },
  {
    id: "never",
    title: "What we never ask for or do",
    items: [
      "We never ask for your banking passwords, PINs, one-time passwords or card security codes.",
      "We never log into your bank, move money or make payments for you.",
      "We do not sell your personal or financial information. [CONFIRM: keep only if this is a firm commitment.]",
    ],
  },
  {
    id: "why",
    title: "Why we use it",
    items: [
      "To read your statements, list your transactions and show you potential money leaks. This is the service you ask us for, and you agree to it when you upload a statement.",
      "To run your account, tell you about your findings and handle your plan.",
      "To keep TracePay secure, prevent abuse and fix problems.",
      "To email you about the launch, if you joined the waitlist and agreed to it.",
      "To improve TracePay, using feedback you choose to share. [CONFIRM: say whether any usage data is also used for this.]",
    ],
    after:
      "Taking part is voluntary and nothing is assumed: consent starts unticked, and you choose which statements to add. You can withdraw your consent at any time.",
  },
  {
    id: "automated",
    title: "Automated analysis",
    paragraphs: [
      "TracePay analyses your transactions automatically to flag patterns such as possible duplicate payments, fees and recurring charges. These are signals for you to review, not decisions about you, and they do not affect your legal rights or your access to credit. A statement can’t show whether you use a service, so a finding is never proof of a mistake or a saving.",
      "[CONFIRM: say whether any text from your transactions is sent to an AI service, which provider, and what is removed first. If none is, say so here.]",
    ],
  },
  {
    id: "share",
    title: "Who we share it with",
    paragraphs: [
      "We share personal information only with service providers who process it for us, under agreements that require them to protect it, and only as far as they need to:",
    ],
    items: [
      "Hosting and database: [CONFIRM: provider, for example Supabase, and the region where data is stored].",
      "Payments and plans: Apple and Google handle payment through their stores, and RevenueCat tells us whether a plan is active.",
      "Email for the waitlist and support: [CONFIRM: provider].",
      "AI or analysis providers: [CONFIRM: list any, or remove this line].",
    ],
    after:
      "We may also disclose information when the law requires it, for example to a court or the Information Regulator, and to protect our rights or yours.",
  },
  {
    id: "transfers",
    title: "Sending information outside South Africa",
    paragraphs: [
      "Some of our providers may store or process information outside South Africa. When that happens we make sure the provider is bound by rules or an agreement that gives your information protection similar to POPIA. [CONFIRM: list the countries involved.]",
    ],
  },
  {
    id: "keep",
    title: "How long we keep it",
    items: [
      "Waitlist details: until we have emailed you about the launch and [CONFIRM: number] months after that, or until you ask us to remove them.",
      "Your account, statements and findings: for as long as you have a TracePay account. If you delete your account or ask us to, we delete them. [CONFIRM: how long deleted data takes to leave backups.]",
      "Purchase and tax records: for as long as tax and accounting law requires. [CONFIRM: period.]",
      "Security and error logs: [CONFIRM: period].",
    ],
  },
  {
    id: "security",
    title: "How we protect it",
    paragraphs: [
      "We use reasonable technical and organisational measures to protect your information, including access controls, encrypted connections and limiting who can see it. [CONFIRM: add specifics you can stand behind, such as encryption at rest and staff access limits.] No system is perfectly secure. If a breach affects your information we will tell you and the Information Regulator as POPIA requires.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: ["Under POPIA you can:"],
    items: [
      "ask what personal information we hold about you and get a copy;",
      "ask us to correct or delete information that is wrong, out of date or no longer needed;",
      "withdraw your consent or object to us using your information;",
      "ask us to delete your account and the statements and findings in it, in the app’s Settings or by emailing us;",
      "stop receiving launch emails, using the unsubscribe link or by emailing us.",
    ],
    after:
      "Email hello@tracepay.co.za to use any of these rights. We may need to confirm it is you first. If you are unhappy with how we handle your information, you can complain to the Information Regulator of South Africa (inforegulator.org.za).",
  },
  {
    id: "children",
    title: "Children",
    paragraphs: [
      "TracePay is for people aged 18 and over. We don’t knowingly collect information about children. If you think a child has given us information, email us and we will delete it.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    paragraphs: [
      "This website stores your light or dark display choice in your browser. It does not use advertising or cross-site tracking cookies. [CONFIRM: update this if you add analytics or other cookies, and add a notice if the law then requires one.]",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "If we change this policy in a way that matters, we will update the date above and, for app users, tell you in the app or by email before the change applies.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      "Questions, requests or complaints: hello@tracepay.co.za. Please put “Privacy” in the subject line.",
    ],
  },
];
