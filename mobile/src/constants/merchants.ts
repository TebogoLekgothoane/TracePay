/** Hunter Logo API base — https://hunter.io/api/logo */
export const HUNTER_LOGO_BASE = "https://logos.hunter.io";

export type MerchantCatalogEntry = {
  id: string;
  domain: string;
  patterns: RegExp[];
};

/** SA banks → domain for Hunter when no merchant logo applies. */
export const BANK_DOMAINS: Record<string, string> = {
  FNB: "fnb.co.za",
  ABSA: "absa.co.za",
  CAPITEC: "capitec.co.za",
  STANDARD_BANK: "standardbank.co.za",
  TYMEBANK: "tymebank.co.za",
  NEDBANK: "nedbank.co.za",
  INVESTEC: "investec.com",
  AFRICAN_BANK: "africanbank.co.za",
  DISCOVERY: "discovery.co.za",
  OLDMUTUAL: "oldmutual.co.za",
};

/**
 * Curated merchant → domain map for SMS merchant strings.
 * Extend as you see new recurring merchants in parsed SMS data.
 */
export const MERCHANT_CATALOG: MerchantCatalogEntry[] = [
  // Groceries
  { id: "shoprite", domain: "shoprite.co.za", patterns: [/shoprite/i] },
  { id: "checkers", domain: "checkers.co.za", patterns: [/checkers/i] },
  { id: "woolworths", domain: "woolworths.co.za", patterns: [/woolworths|woolies/i] },
  { id: "pnp", domain: "pnp.co.za", patterns: [/pick\s*n\s*pay|\bpnp\b/i] },
  { id: "spar", domain: "spar.co.za", patterns: [/\bspar\b/i] },
  { id: "foodlovers", domain: "foodloversmarket.co.za", patterns: [/food\s*lover/i] },

  // Fuel
  { id: "shell", domain: "shell.co.za", patterns: [/\bshell\b/i] },
  { id: "engen", domain: "engen.co.za", patterns: [/engen/i] },
  { id: "bp", domain: "bp.com", patterns: [/\bbp\b/i] },
  { id: "sasol", domain: "sasol.com", patterns: [/sasol/i] },
  { id: "caltex", domain: "caltex.co.za", patterns: [/caltex/i] },
  { id: "total", domain: "totalenergies.com", patterns: [/total\s*(energies|sa)?/i] },

  // Dining
  { id: "kfc", domain: "kfc.co.za", patterns: [/\bkfc\b/i] },
  { id: "mcdonalds", domain: "mcdonalds.co.za", patterns: [/mcdonald/i] },
  { id: "steers", domain: "steers.co.za", patterns: [/steers/i] },
  { id: "nandos", domain: "nandos.co.za", patterns: [/nando/i] },
  { id: "spur", domain: "spursteakranches.com", patterns: [/\bspur\b/i] },
  { id: "wimpy", domain: "wimpy.co.za", patterns: [/wimpy/i] },
  { id: "vida", domain: "vidaecaffe.com", patterns: [/vida\s*e?\s*caffe|vidaecaffe/i] },

  // Entertainment
  { id: "netflix", domain: "netflix.com", patterns: [/netflix/i] },
  { id: "showmax", domain: "showmax.com", patterns: [/showmax/i] },
  { id: "dstv", domain: "dstv.com", patterns: [/dstv|multichoice/i] },
  { id: "spotify", domain: "spotify.com", patterns: [/spotify/i] },
  { id: "numetro", domain: "numetro.co.za", patterns: [/nu\s*metro/i] },
  { id: "sterkinekor", domain: "sterkinekor.com", patterns: [/ster.?kinekor/i] },

  // Utilities & telco
  { id: "eskom", domain: "eskom.co.za", patterns: [/eskom/i] },
  { id: "telkom", domain: "telkom.co.za", patterns: [/telkom/i] },
  { id: "vodacom", domain: "vodacom.co.za", patterns: [/vodacom/i] },
  { id: "mtn", domain: "mtn.co.za", patterns: [/\bmtn\b/i] },
  { id: "cellc", domain: "cellc.co.za", patterns: [/cell\s*c/i] },
  { id: "rain", domain: "rain.co.za", patterns: [/\brain\b/i] },

  // Online retail
  { id: "takealot", domain: "takealot.com", patterns: [/takealot/i] },
  { id: "amazon", domain: "amazon.com", patterns: [/amazon/i] },
  { id: "superbalist", domain: "superbalist.com", patterns: [/superbalist/i] },
  { id: "bash", domain: "bash.com", patterns: [/bash\.com|\bbash\b/i] },
  { id: "uber", domain: "uber.com", patterns: [/uber/i] },
  { id: "bolt", domain: "bolt.eu", patterns: [/bolt/i] },
  { id: "mrprice", domain: "mrpricegroup.com", patterns: [/mr\s*price|mrprice/i] },

  // Medical
  { id: "clicks", domain: "clicks.co.za", patterns: [/clicks/i] },
  { id: "dischem", domain: "dischem.co.za", patterns: [/dischem/i] },

  // Rewards partners (see constants/partners.ts)
];

export function hunterLogoUrl(domain: string): string {
  return `${HUNTER_LOGO_BASE}/${domain}`;
}
