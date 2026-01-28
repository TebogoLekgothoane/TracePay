import { useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Language } from "@/types/navigation";

const LANGUAGE_KEY = "@tracepay_language";

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>("en");
  const [isLoading, setIsLoading] = useState(true);

  const loadLanguage = useCallback(async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      const validLanguages: Language[] = ["en", "xh", "zu", "af", "st", "tn", "nso", "ts", "ve", "nr", "ss"];
      if (savedLanguage && validLanguages.includes(savedLanguage as Language)) {
        setLanguageState(savedLanguage as Language);
      }
    } catch (error) {
      console.error("Error loading language:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      setLanguageState(lang);
    } catch (error) {
      console.error("Error saving language:", error);
    }
  }, []);

  return {
    language,
    setLanguage,
    loadLanguage,
    isLoading,
  };
}

export const translations = {
  en: {
    selectLanguage: "Select Your Language",
    english: "English",
    isiXhosa: "IsiXhosa",
    continue: "Continue",
    connectBank: "Connect Your Bank",
    consentTitle: "Consent to Use Your Financial Data",
    consentSubtitle: "Please read carefully before continuing.",
    consentIntro: "By tapping \"I Agree\", you give permission for this app to:",
    dataAccessTitle: "What data we access (only with your permission)",
    dataAccess1: "Your bank transactions (amounts, dates, fees)",
    dataAccess2: "(Optional) Your mobile airtime and mobile money spending patterns",
    whyWeNeedTitle: "Why we need this data",
    whyWeNeed1: "To show you where your money is being lost",
    whyWeNeed2: "To identify hidden fees, silent deductions, and airtime drains",
    whyWeNeed3: "To help you take control of your money",
    whatWeDoNotTitle: "What we do NOT do",
    whatWeDoNot1: "We do not sell your data",
    whatWeDoNot2: "We do not access your passwords",
    whatWeDoNot3: "We do not move money without your action",
    yourRightsTitle: "Your rights",
    yourRights1: "You can choose what data to share",
    yourRights2: "You can withdraw consent at any time",
    yourRights3: "You can delete your data whenever you want",
    importantTitle: "Important",
    important1: "Your data is protected and encrypted",
    important2: "Access is read-only",
    important3: "This follows South African financial regulations",
    includeMomoData: "Include MTN MoMo data",
    momoDescription: "Reveal airtime purchases and MoMo transaction fees",
    agreeAndContinue: "I Agree & Continue",
    cancel: "Cancel",
    openMyMoney: "Open My Money",
    privacyPolicy: "Privacy Policy",
    analyzing: "Learning your money...",
    analyzingDetail: "Finding where your money died",
    whereMoneyDied: "Where Your Money Died",
    thisMonth: "This Month",
    lostTotal: "You lost",
    hiddenFees: "Hidden Fees",
    mashonisaInterest: "Mashonisa Interest",
    airtimeDrains: "Airtime Drains",
    subscriptions: "Subscriptions",
    bankCharges: "Bank Charges",
    momoFees: "MoMo Fees",
    other: "Other Losses",
    ofIncome: "of income",
    freeze: "Freeze",
    listenToMoney: "Listen to my money",
    details: "Details",
    whyThisHurts: "Why This Hurts",
    freezeThis: "Freeze This",
    learnMore: "Learn More",
    freezeControl: "Freeze Control",
    pauseDebitOrders: "Pause Debit Orders",
    blockFeeAccounts: "Block Fee-Heavy Accounts",
    setAirtimeLimit: "Set Airtime Limit",
    cancelSubscriptions: "Cancel Subscriptions",
    apply: "Apply",
    warning: "Warning",
    freezeWarning: "You are about to freeze these services",
    confirm: "Confirm",
    nothingWrong: "Nothing Wrong Found",
    nothingWrongDetail: "Your money looks healthy this month!",
    back: "Back",
    voiceExplanation: "Voice Explanation",
    playAudio: "Play Audio",
    stopAudio: "Stop Audio",
    momoSavingsTitle: "MoMo Savings Opportunity",
    youSpent: "You spent",
    onMomo: "on airtime & data using MoMo",
    couldSpend: "If you bought monthly bundles, you could have spent",
    couldSave: "You could have saved",
    thisMonthLower: "this month",
    optOutSubscription: "Opt Out",
    subscriptionOptedOut: "Opted Out",
    manageSubscriptions: "Manage Subscriptions",
  },
  xh: {
    selectLanguage: "Khetha Ulwimi Lwakho",
    english: "IsiNgesi",
    isiXhosa: "IsiXhosa",
    continue: "Qhubeka",
    connectBank: "Xhuma Ibhanki Yakho",
    consentTitle: "Imvume Yokusebenzisa Idatha Yakho Yemali",
    consentSubtitle: "Nceda ufunde ngononophelo phambi kokuba uqhubeke.",
    consentIntro: "Ngokucofa \"Ndiyavuma\", unika imvume kule app ukuba:",
    dataAccessTitle: "Yeyiphi idatha esiyifikelelayo (ngemvume yakho kuphela)",
    dataAccess1: "Iintlawulo zakho zebhanki (izixa, imihla, iimali)",
    dataAccess2: "(Ukhetho) Iindlela zakho zokusebenzisa i-airtime nemali yefowuni",
    whyWeNeedTitle: "Kutheni sifuna le datha",
    whyWeNeed1: "Ukukubonisa apho imali yakho ilahleka khona",
    whyWeNeed2: "Ukufumana iimali ezifihlakeleyo, ukutsalwa okuzolileyo, nokuvuza kwe-airtime",
    whyWeNeed3: "Ukukunceda ulawule imali yakho",
    whatWeDoNotTitle: "Into esingayENZIYO",
    whatWeDoNot1: "Asithengisi idatha yakho",
    whatWeDoNot2: "Asifikeleli kwiiphasiwedi zakho",
    whatWeDoNot3: "Asiyishukumisi imali ngaphandle kwesenzo sakho",
    yourRightsTitle: "Amalungelo akho",
    yourRights1: "Ungakhetha ukuba wabelana nayiphi idatha",
    yourRights2: "Ungarhoxisa imvume nanini na",
    yourRights3: "Ungayicima idatha yakho nanini na ofuna",
    importantTitle: "Okubalulekileyo",
    important1: "Idatha yakho ikhuselekile kwaye i-encrypted",
    important2: "Ukufikelela kukufunda kuphela",
    important3: "Oku kulandela imithetho yezimali yoMzantsi Afrika",
    includeMomoData: "Faka idatha ye-MTN MoMo",
    momoDescription: "Veza ukuthengwa kwe-airtime neemali ze-MoMo",
    agreeAndContinue: "Ndiyavuma & Qhubeka",
    cancel: "Rhoxisa",
    openMyMoney: "Vula Imali Yam",
    privacyPolicy: "Umgaqo-nkqubo Wabucala",
    analyzing: "Sifunda imali yakho...",
    analyzingDetail: "Sifumana apho imali yakho yafa khona",
    whereMoneyDied: "Iphelile Imali Yakho",
    thisMonth: "Le Nyanga",
    lostTotal: "Uphulukene ne",
    hiddenFees: "Iimali Ezifihlakeleyo",
    mashonisaInterest: "Inzala yeMashonisa",
    airtimeDrains: "Ukuphela kwe-Airtime",
    subscriptions: "Izabhaliso",
    bankCharges: "Iintlawulo zeBhanki",
    momoFees: "Iimali ze-MoMo",
    other: "Ezinye Ilahleko",
    ofIncome: "yemivuzo",
    freeze: "Misa",
    listenToMoney: "Mamela imali yam",
    details: "Iinkcukacha",
    whyThisHurts: "Kutheni Oku Kubuhlungu",
    freezeThis: "Misa Oku",
    learnMore: "Funda Ngakumbi",
    freezeControl: "Ulawulo Lokumisa",
    pauseDebitOrders: "Misa ii-Debit Orders",
    blockFeeAccounts: "Vala ii-Akhawunti Ezinendleko Eziphezulu",
    setAirtimeLimit: "Beka Umda we-Airtime",
    cancelSubscriptions: "Rhoxisa Izabhaliso",
    apply: "Sebenzisa",
    warning: "Isilumkiso",
    freezeWarning: "Uza kumisa ezi nkonzo",
    confirm: "Qinisekisa",
    nothingWrong: "Akukho Nto Iphambukileyo",
    nothingWrongDetail: "Imali yakho ibonakala iphilile le nyanga!",
    back: "Emva",
    voiceExplanation: "Inkcazo Ngelizwi",
    playAudio: "Dlala Isandi",
    stopAudio: "Misa Isandi",
    momoSavingsTitle: "Ithuba Lokonga le-MoMo",
    youSpent: "Usebenzise",
    onMomo: "kwi-airtime ne-data usebenzisa i-MoMo",
    couldSpend: "Ukuba wathenga ii-bundle zenyanga, ubunokusebenzisa",
    couldSave: "Ubunokonga",
    thisMonthLower: "le nyanga",
    optOutSubscription: "Phuma",
    subscriptionOptedOut: "Uphumile",
    manageSubscriptions: "Lawula Izabhaliso",
  },
};
