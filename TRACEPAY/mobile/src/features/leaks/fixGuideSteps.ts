import type { GuideStep, GuideLink } from "./fixContent";

/**
 * Detailed "how to stop this leak" steps, written in plain English.
 * Each step says what to do, where to tap, and what you should see, and links to the
 * official page where one exists. Keyed by the fix action id used in fixContent.ts.
 *
 * Links go to each company's own site (home or help pages that stay put), so they do not
 * break when a company redesigns a deep page.
 */

function steps(...items: [string, string, GuideLink?][]): GuideStep[] {
  return items.map(([title, description, link], index) => ({
    id: String(index + 1),
    title,
    description,
    ...(link ? { link } : {}),
  }));
}

const L = (label: string, url: string): GuideLink => ({ label, url });

const NCR = L("National Credit Regulator", "https://www.ncr.org.za/");
const OMBUD = L("Ombudsman for Banking Services", "https://www.obssa.co.za/");

export const GUIDE_STEPS: Record<string, GuideStep[]> = {
  // ─── Bank fees ───────────────────────────────────────────────────────────────
  account: steps(
    [
      "Pick a cheaper account",
      "Look at the bank fee table on the last screen. Choose an account with a low or zero monthly fee that still does what you need, like card payments and a banking app. If you only use your account for salary, groceries and a few debit orders, a basic account is usually enough.",
      L("Capitec Bank", "https://www.capitecbank.co.za/"),
    ],
    [
      "Open the new account in the bank's app",
      "Download the bank's app or open its website. Tap 'Open an account'. Have your South African ID and your cellphone with you. You will take a selfie so the bank knows it is you. Most banks approve you the same day.",
      L("TymeBank", "https://www.tymebank.co.za/"),
    ],
    [
      "Prove who you are and where you live",
      "The bank may ask for a recent proof of address. A municipal bill or a bank statement that is less than 3 months old works. Take a clear photo with all four corners showing. If the photo is blurry the bank will send it back and you lose a day.",
    ],
    [
      "Write down every debit order on your old account",
      "Open your old banking app and look for 'Debit orders' or 'Mandates'. Take a screenshot of the full list. These are the companies that take money from you each month, like insurance, gym and TV. If you forget one, it will fail after you close the old account and you may get a penalty fee.",
    ],
    [
      "Move your salary first",
      "Give your employer the new account number and bank name. Ask them to start paying into it from next month. Keep the old account open until you have seen one full salary arrive in the new one.",
    ],
    [
      "Move each debit order to the new account",
      "Contact each company on your list and give them the new account details. Many will let you do this in their own app. Check each one on your next statement to make sure the money was taken from the new account.",
    ],
    [
      "Empty and close the old account",
      "Once salary and debit orders work on the new account, move what is left over to the new account. Leave about R100 in the old one for any late debit. Then ask the bank to close it, in the app, at a branch or by phone. Ask for a letter that says the account is closed with a zero balance.",
      L("Ombudsman for Banking Services", "https://www.obssa.co.za/"),
    ],
  ),

  sms: steps(
    [
      "Open your banking app",
      "Sign in with your PIN or fingerprint. Do this on your own phone, not a shared one.",
    ],
    [
      "Find the alerts settings",
      "Look under 'Settings', 'Profile', 'Notifications' or 'Alerts'. Different banks use different names. If you cannot find it, use the search icon in the app and type 'alerts'.",
    ],
    [
      "Turn off paid SMS for everyday purchases",
      "Many banks charge about R0.40 to R0.60 for each SMS. If you buy something every day, that adds up fast. Switch off SMS for card purchases and balance updates.",
    ],
    [
      "Switch on free app notifications",
      "Turn on 'Push notifications' for the same things. They arrive on your phone for free and look almost the same as an SMS.",
    ],
    [
      "Keep fraud alerts on",
      "Leave the alerts for big amounts, new devices and PIN changes switched on. These protect you if someone steals your card. Losing a few rand on those is worth it.",
    ],
    [
      "Check your next statement",
      "Next month look for lines called 'SMS notification fee' or 'Notification charge'. If they are still there, call your bank and ask them to remove the SMS service from your account.",
    ],
  ),

  atm: steps(
    [
      "Open the ATM finder in your banking app",
      "Most banking apps have an ATM or branch locator. Tap it and allow the app to see your location.",
    ],
    [
      "Find 2 or 3 ATMs from your own bank",
      "Using your own bank's ATM is cheaper than using another bank's. Save the ones near your home, work and the shops you visit most.",
    ],
    [
      "Take out cash less often, and a bit more each time",
      "Every withdrawal can cost a fee. Taking R600 once costs less than taking R200 three times. Plan your week and take what you need in one go.",
    ],
    [
      "Ask for cash back at the till",
      "At many big shops you can ask the cashier for cash back when you pay with your card. It is often free or much cheaper than an ATM. Limits are usually between R200 and R1,000.",
      L("Pick n Pay", "https://www.pnp.co.za/"),
    ],
    [
      "Say no to 'other bank' ATMs",
      "When the screen warns about a fee, tap Cancel and walk to your own bank's ATM. A fee warning is a sign that you are about to be charged.",
    ],
  ),

  services: steps(
    [
      "Get last month's statement",
      "In your banking app, open 'Statements' and download last month's PDF. Have a highlighter or a notes app ready.",
    ],
    [
      "Find the small monthly fees",
      "Look for lines like 'Account fee', 'Cover fee', 'Notification fee' or 'Insurance'. Write each one down with its amount. These small charges are the leak.",
    ],
    [
      "Open your list of products",
      "Look under 'Products', 'Manage account' or 'Services' in your app. You will see add-ons you may have said yes to years ago.",
    ],
    [
      "Cancel the ones you do not use",
      "If you do not use an extra like cell phone insurance or account cover, tap 'Cancel' or 'Remove'. If there is no button, call the number on the back of your card and ask them to remove it.",
    ],
    [
      "Ask for a lower fee",
      "Call your bank and say: 'I am looking at cheaper accounts. Can you move me to a lower fee plan?' Banks sometimes agree to keep a customer.",
    ],
    [
      "Check again next month",
      "Open your new statement and see that the fees are gone. If one is still there, ask the bank to refund it. If they say no, you can complain to the banking ombudsman.",
      L("Ombudsman for Banking Services", "https://www.obssa.co.za/"),
    ],
  ),

  // ─── Airtime and data ────────────────────────────────────────────────────────
  bundle: steps(
    [
      "Check how much data you really use",
      "Open your network's app (or dial the code your network gives you) and look at the last 3 months. Write down the number for each month. Use the average, not your biggest month.",
      L("Vodacom", "https://www.vodacom.co.za/"),
    ],
    [
      "Compare the price per GB",
      "Out-of-bundle and small top-ups cost the most per GB. A monthly bundle is almost always cheaper. Look at the bundle table in this app, then check the network's own page for today's price.",
      L("MTN", "https://www.mtn.co.za/"),
    ],
    [
      "Choose a bundle that covers your average",
      "Pick one a little above your average so you do not run out. If you run out, you pay the expensive price. Do not buy a huge bundle you will not use.",
      L("Telkom", "https://www.telkom.co.za/"),
    ],
    [
      "Buy it in the network app or with a code",
      "Open the app, tap 'Buy' or 'Data', and choose the bundle. You should get an SMS or an in-app message that confirms it. Keep that message.",
      L("Cell C", "https://www.cellc.co.za/"),
    ],
    [
      "Turn on a usage warning",
      "Set an alert at about 50% and 80% so that you know before the data runs out. Your phone also has one under 'Settings', then 'Mobile data', then 'Data warning'.",
    ],
  ),

  wifi: steps(
    [
      "Auto-connect to your home and work Wi-Fi",
      "On your phone open Settings, then Wi-Fi. Tap your home network and switch on 'Auto-join' or 'Connect automatically'. Do the same at work. Your phone will then use Wi-Fi without you thinking about it.",
    ],
    [
      "Stop apps using data in the background",
      "Go to Settings, then Mobile data (or Cellular). You will see a list of apps and how much data each used. Switch off data for the biggest ones that you only need on Wi-Fi, like video and music apps.",
    ],
    [
      "Download shows and music on Wi-Fi",
      "Netflix, YouTube Premium and Spotify let you download. Do this at home on Wi-Fi, then watch or listen offline on the road at no data cost.",
      L("Spotify", "https://www.spotify.com/"),
    ],
    [
      "Turn off auto-play videos",
      "In Instagram, TikTok, Facebook and X, open Settings and find 'Data saver' or 'Auto-play'. Set videos to play only on Wi-Fi.",
    ],
    [
      "Update apps on Wi-Fi only",
      "In your app store settings, choose 'Over Wi-Fi only' for app updates. Big updates can eat 1GB or more.",
    ],
    [
      "Think about home internet",
      "If you often use mobile data at home because you have no Wi-Fi, a fibre or LTE line may cost less per month than the data you buy. Check which providers cover your street.",
      L("Openserve", "https://www.openserve.co.za/"),
    ],
  ),

  "data-alerts": steps(
    [
      "Open your network's app",
      "Sign in to the app for your network. If you do not have one yet, download it from your phone's app store.",
      L("Vodacom", "https://www.vodacom.co.za/"),
    ],
    [
      "Find 'Usage' or 'Spend limit'",
      "It is usually on the home screen or under 'My account'. This is where you can see how much you have used.",
      L("MTN", "https://www.mtn.co.za/"),
    ],
    [
      "Set alerts at 50% and 80%",
      "A message at half way tells you if you are using data too fast. A message at 80% gives you time to slow down before it runs out and you pay the high price.",
    ],
    [
      "Add a warning on your phone too",
      "Open Settings, then Mobile data, then 'Data warning' and 'Data limit'. Enter the size of your bundle. Your phone will warn you and can switch data off at the limit.",
    ],
    [
      "Decide your top-up rule",
      "Pick one rule and stick to it, for example: 'If I run out, I will use Wi-Fi first and top up only on Friday.' This stops small emergency top-ups.",
    ],
  ),

  topups: steps(
    [
      "Add up last month's airtime and data",
      "Look at your statement or your network app. Add every top-up, even the small R10 ones. Many people are surprised by the total.",
    ],
    [
      "Pick one monthly bundle that covers it",
      "If you spent R300 on small top-ups, a R250 monthly bundle will often give you more data for less money.",
      L("Telkom", "https://www.telkom.co.za/"),
    ],
    [
      "Auto-renew only if your use is steady",
      "Auto-renew is handy if you use about the same each month. If your usage changes a lot, buy the bundle by hand so you do not pay for data you will not use.",
    ],
    [
      "Remove quick top-up shortcuts",
      "Delete saved airtime shortcuts in your banking app and wallet apps. Fewer shortcuts means fewer impulse top-ups.",
    ],
    [
      "Look for Wi-Fi before you buy emergency data",
      "Before you top up, ask yourself: is there Wi-Fi nearby? A coffee shop, a mall or a friend's home can save you R30 or more.",
    ],
  ),

  // ─── Spending alerts, balance, cash ──────────────────────────────────────────
  alerts: steps(
    [
      "Open notification settings in your banking app",
      "Look under 'Settings', then 'Notifications' or 'Alerts'. Use the search icon if you cannot find it.",
    ],
    [
      "Turn on push alerts for card and debit order activity",
      "You will get a message every time money leaves your account. This is the fastest way to notice something you did not buy.",
    ],
    [
      "Set a minimum amount",
      "If you get too many alerts you will stop reading them. Set the alert to start at about R50 or R100.",
    ],
    [
      "Allow the app to send notifications on your phone",
      "In your phone's Settings, open Notifications, find your banking app and switch on 'Allow notifications' and 'Sounds'.",
    ],
    [
      "Act the same day on strange charges",
      "If you see a name you do not know, open the transaction and tap 'Dispute' or call the number on the back of your card. The sooner you report it, the easier it is to get your money back.",
      OMBUD,
    ],
  ),

  balance: steps(
    [
      "Check your balance in the banking app",
      "Opening the app is free. ATM balance checks and USSD balance checks can cost a few rand each time.",
    ],
    [
      "Turn on fingerprint or face login",
      "Open Settings in the app and switch on 'Biometric login'. Checking your balance then takes two seconds, so you will do it for free instead of at an ATM.",
    ],
    [
      "Switch on free balance alerts",
      "Many banks send a free push message with your balance after each payment or each morning. Look under 'Notifications'.",
    ],
    [
      "Say no to ATM balance screens",
      "When an ATM asks 'Do you want to see your balance?', tap No unless it says that it is free.",
    ],
    [
      "Look at TracePay once a day",
      "TracePay shows a quick snapshot of your spending, so you do not need to check your balance again and again.",
    ],
  ),

  cashback: steps(
    [
      "Choose a shop that offers cash back",
      "Big supermarkets and pharmacies usually do. Look for a sign at the till or ask the cashier.",
      L("Pick n Pay", "https://www.pnp.co.za/"),
    ],
    [
      "Pay by debit card and ask for cash back",
      "Say 'I would like R200 cash back please' before you tap or insert your card. The cashier will add it to your total.",
    ],
    [
      "Stay under the limit",
      "Each shop has a limit, often R200 to R1,000. If you ask for more, they will say no.",
    ],
    [
      "Check the fee on your statement",
      "Some banks charge a small fee for cash back. It is usually less than an ATM fee. Compare both on your statement.",
    ],
    [
      "Use cash back instead of other-bank ATMs",
      "If you are already shopping, cash back saves you a trip and the extra ATM fee.",
    ],
  ),

  card: steps(
    [
      "Switch on tap to pay",
      "In your banking app, open your card settings and switch on 'Tap to pay' or 'Contactless'. Set a limit you are comfortable with.",
    ],
    [
      "Add your card to your phone wallet",
      "Open Google Wallet or Apple Wallet, tap 'Add card' and follow the steps. Your bank will send a code to confirm.",
    ],
    [
      "Use your card for transport and food first",
      "These are the places where people spend cash without noticing. If you start paying by card there, your spending is tracked automatically in TracePay.",
    ],
    [
      "Keep a small cash float only",
      "Keep about R100 to R200 in cash for emergencies, like a taxi or a spaza shop that does not take cards.",
    ],
    [
      "Review cash withdrawals once a week",
      "Open TracePay and look at your cash withdrawals. If they are going up, ask yourself where the cash goes.",
    ],
  ),

  // ─── Subscriptions ───────────────────────────────────────────────────────────
  cancel: steps(
    [
      "Make a list of every recurring payment",
      "Open TracePay's recurring payments list. Write down each name and what you pay. Be honest about which ones you used in the last month.",
    ],
    [
      "Open each service's account page",
      "Sign in on the service's website, not through a link in an email. Look for 'Account', 'Billing' or 'Membership'.",
      L("Netflix", "https://www.netflix.com/account"),
    ],
    [
      "Cancel and save the proof",
      "Tap 'Cancel' and follow the screens. Take a screenshot of the final page and keep the email they send you.",
      L("Spotify", "https://www.spotify.com/account/subscription/"),
    ],
    [
      "Check the app store too",
      "If you signed up inside an app on your phone, cancel it in your phone settings: Apple ID, then Subscriptions, or Google Play, then Payments and subscriptions.",
      L("Adobe", "https://account.adobe.com/plans"),
    ],
    [
      "Check your next statement",
      "Next month look for the same name. If the charge is still there, show your proof to the company and ask for a refund. If they say no, ask your bank to dispute it.",
    ],
  ),

  limits: steps(
    [
      "Open card controls in your banking app",
      "Look for 'Card settings', 'Manage card' or 'Limits'.",
    ],
    [
      "Set a monthly limit for fun spending",
      "Choose a number you can afford for streaming, games and entertainment. When you reach it, the card will be declined, so you cannot spend by accident.",
    ],
    [
      "Turn on alerts for large payments",
      "Set an alert for any payment above about R200 so you can check that it is really yours.",
    ],
    [
      "Block online or foreign shops if you do not use them",
      "Look for 'Online purchases' or 'International payments' and switch them off. You can switch them back on when you need them.",
    ],
    [
      "Check your limits once a month",
      "Open TracePay at the start of each month. If you hit the limit early, ask yourself whether it is too low or whether you are spending too much.",
    ],
  ),

  // ─── Debit orders ────────────────────────────────────────────────────────────
  pause: steps(
    [
      "Find the debit order on your statement",
      "Look for the name, the date and the amount. Use TracePay's debit order list to find the exact words your bank uses.",
    ],
    [
      "Tell the company you want to cancel or pause",
      "Do this first. Call, email or use their app. Ask for a reference number and a date when it will stop. Write both down.",
    ],
    [
      "Open 'Debit orders' in your banking app",
      "It is often under 'Payments', 'Transact' or 'Account settings'. You will see a list of companies that can take money from you.",
    ],
    [
      "Stop the debit order",
      "Choose the company and tap 'Stop' or 'Cancel'. Confirm with your PIN or fingerprint. Under South African rules your bank must let you stop a debit order.",
      L("Ombudsman for Banking Services", "https://www.obssa.co.za/"),
    ],
    [
      "Watch the next two statements",
      "If the company still takes money after you stopped it, tell your bank straight away and give them your proof. You can ask for the money back.",
      NCR,
    ],
  ),

  "cancel-debit": steps(
    [
      "Sign in to your banking app",
      "Use the profile that owns the account that is being charged. If you have more than one account, check that you are in the right one.",
    ],
    [
      "Open 'Debit orders', 'Stop orders' or 'Mandates'",
      "It is often under 'Payments', 'Transact' or 'Account settings'. If you cannot find it, use the search icon and type 'debit'.",
    ],
    [
      "Choose the debit you want to stop",
      "Match the company name and the amount with your TracePay leak list. Some companies use a different name on your statement, like a short code.",
    ],
    [
      "Tap Stop and confirm",
      "Read the message about future payments, then confirm with a one-time PIN or your fingerprint.",
    ],
    [
      "Tell the company you stopped it",
      "Send them a short message so they close your account. If you do not, they may send a failed-debit fee or call you about money you do not owe.",
    ],
    [
      "If a debit still comes through",
      "Contact your bank straight away and ask them to reverse it. If they will not help, complain to the banking ombudsman.",
      OMBUD,
    ],
  ),

  // ─── Cancel guides for named subscriptions ───────────────────────────────────
  "cancel-netflix": steps(
    [
      "Open Netflix in a browser",
      "Go to netflix.com and sign in. Doing it on the website is easier than in the app. If you pay through your phone provider or the app store, you will cancel there instead (the page will tell you).",
      L("Netflix account page", "https://www.netflix.com/account"),
    ],
    [
      "Go to your membership",
      "Click your profile picture at the top, then 'Account'. Look for the 'Membership & Billing' box.",
    ],
    [
      "Press 'Cancel Membership'",
      "Netflix will ask you a few questions. You can skip them. Keep pressing 'Finish Cancellation' until you see a message that says your membership will end on a certain date.",
      L("Netflix cancel page", "https://www.netflix.com/cancelplan"),
    ],
    [
      "Check the end date",
      "You can keep watching until that date. Nothing more is taken after it. Netflix keeps your profiles for 10 months in case you come back.",
    ],
    [
      "Save the proof",
      "Take a screenshot of the cancel page and keep the confirmation email. If you are charged again, you can show this to the bank.",
    ],
  ),

  "cancel-showmax": steps(
    [
      "Open the Showmax website",
      "Sign in to your account on a computer or phone browser. If you pay through your cellphone network or DStv, cancel with them instead.",
      L("Showmax", "https://www.showmax.com/"),
    ],
    [
      "Open your account settings",
      "Click your profile, then 'Account' or 'Manage subscription'.",
    ],
    [
      "Choose to cancel your recurring payment",
      "Follow the screens and confirm. You will see the date that your plan ends.",
    ],
    [
      "If you pay with a partner",
      "If Showmax was bundled with a phone contract or DStv package, you must ask that company to remove it, or it may keep billing you.",
      L("DStv", "https://www.dstv.com/"),
    ],
    [
      "Save the proof",
      "Screenshot the final page and keep the email. Check that the debit is gone on your next statement.",
    ],
  ),

  "cancel-spotify": steps(
    [
      "Open Spotify's account page in a browser",
      "You cannot cancel inside the phone app. Use a browser on your phone or computer and sign in.",
      L("Spotify subscription page", "https://www.spotify.com/account/subscription/"),
    ],
    [
      "Look at 'Your plan'",
      "Scroll to 'Your plan'. If you see 'Change plan', tap it. If you pay through your phone provider or the app store, it will tell you where to cancel.",
    ],
    [
      "Choose 'Cancel Premium'",
      "Press the cancel button at the bottom and follow the screens until you reach the confirmation.",
    ],
    [
      "Check when it ends",
      "Your Premium stays until the end of the month you paid for. After that Spotify turns into the free version with ads.",
    ],
    [
      "Save the proof",
      "Take a screenshot of the confirmation and keep Spotify's email.",
    ],
  ),

  "cancel-adobe": steps(
    [
      "Sign in to your Adobe account",
      "Go to account.adobe.com on a computer. Use the same email you used when you bought the plan.",
      L("Adobe plans", "https://account.adobe.com/plans"),
    ],
    [
      "Open 'Plans' and 'Manage plan'",
      "Find your plan and press 'Manage plan', then 'Cancel your plan'.",
    ],
    [
      "Read the cancel fee message",
      "If you chose an annual plan paid monthly, Adobe may ask for a fee if you cancel early. The screen shows the exact amount before you confirm. If it is more than you want to pay, wait until the plan renews or ask them to reduce it.",
    ],
    [
      "Confirm the cancel",
      "Say why you are leaving, then finish. Check that you get a confirmation email.",
    ],
    [
      "Save the proof",
      "Screenshot the confirmation and the email. Look at your next statement to be sure the charge has stopped.",
    ],
  ),

  "cancel-canva": steps(
    [
      "Sign in to Canva",
      "Open canva.com on a browser and sign in.",
      L("Canva billing", "https://www.canva.com/settings/billing-and-teams"),
    ],
    [
      "Open 'Account settings' then 'Billing & plans'",
      "Click your picture at the top right, then 'Account settings', then 'Billing & plans'.",
    ],
    [
      "Choose 'Cancel subscription'",
      "Press the cancel button and follow the screens. Canva may offer a discount. You can say no.",
    ],
    [
      "Check the end date",
      "You keep Pro features until the end of your billing period.",
    ],
    [
      "Save the proof",
      "Keep the confirmation email and look for the charge on your next statement.",
    ],
  ),

  // ─── Named debit orders ──────────────────────────────────────────────────────
  "pause-dstv": steps(
    [
      "Call or message DStv first",
      "Use the MyDStv app, the website or the call centre. Say: 'I want to disconnect or suspend my recurring payment.' Ask about 'Seasonal Disconnection' if you only want to pause it.",
      L("DStv", "https://www.dstv.com/"),
    ],
    [
      "Ask for a reference number and the last debit date",
      "Write them down. This is your proof. Ask whether you still owe a final payment.",
    ],
    [
      "Stop the bank debit order",
      "After DStv confirms, open your banking app, go to 'Debit orders' and stop the DStv one.",
    ],
    [
      "Return or keep your decoder",
      "If you are cancelling for good, ask them whether you must return the decoder. If you are pausing, keep it safe.",
    ],
    [
      "Check your statement next month",
      "Make sure there is no new DStv debit. If there is, send your reference number to your bank and ask them to reverse it.",
      OMBUD,
    ],
  ),

  "pause-gym": steps(
    [
      "Read your gym contract",
      "Look for 'Cancellation' or 'Notice period'. Many gyms need 30 days' written notice. Some also charge a fee for ending early.",
    ],
    [
      "Send a cancel letter or email",
      "Say: 'I want to cancel my membership. My name, ID number and member number are...'. Ask them to reply with a date that your membership ends.",
    ],
    [
      "Ask if you can freeze instead",
      "If you plan to come back, ask for a free or cheap membership freeze for 1 to 3 months. This can be better than cancelling and paying a new joining fee.",
    ],
    [
      "Stop the debit order after the final payment",
      "Wait until the last agreed payment, then stop the debit order in your banking app so that no extra charge comes through.",
    ],
    [
      "Keep proof for 3 months",
      "Save every email. If you are charged again, you can show them to the gym and your bank. Consumer rules in South Africa give you the right to cancel a fixed-term contract with reasonable notice.",
      L("National Consumer Commission", "https://www.thencc.org.za/"),
    ],
  ),

  "pause-insurance": steps(
    [
      "Check what you are cancelling",
      "Look at your policy. If it covers your car, home or life, make sure you have other cover or can live without it before you cancel. Being uninsured after an accident can cost much more than the premium.",
    ],
    [
      "Ask in writing to cancel or pause",
      "Send an email to the insurer. Ask for a reference number and the date when cover ends.",
    ],
    [
      "Ask what the last payment will be",
      "Ask whether you will pay a final or pro-rata premium. A pro-rata premium is only for the days you were covered.",
    ],
    [
      "Stop the bank debit order",
      "After the insurer confirms the cancellation, open 'Debit orders' in your banking app and stop that debit.",
    ],
    [
      "Keep proof for 3 months",
      "Save the emails and SMS messages. If you ever get a bill for a later month, show them.",
      L("Ombudsman for Short-term Insurance", "https://www.osti.co.za/"),
    ],
  ),

  // ─── Home page ATM ───────────────────────────────────────────────────────────
  "home-atm": steps(
    [
      "Find your own bank's ATMs",
      "Open the ATM finder in your banking app. Save the ones that are close to home and work.",
    ],
    [
      "Plan your cash for the week",
      "Think about what you really need cash for. Take that amount in one go instead of making many small withdrawals.",
    ],
    [
      "Try cash back at shops",
      "Ask for cash back when you pay by card. It is often cheaper than an ATM.",
      L("Pick n Pay", "https://www.pnp.co.za/"),
    ],
    [
      "Pay by card when you can",
      "If a shop takes cards, use your card so you do not need cash. Your spending also shows up in TracePay.",
    ],
    [
      "Say no to fee warnings",
      "If an ATM warns you about a fee, cancel and find a different ATM.",
    ],
  ),
};
