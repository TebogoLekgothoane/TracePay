export type BundleListing = {
  id: string;
  provider: string;
  logoDomain: string;
  /** The plan as the provider sells it, e.g. "12GB, 30 days". */
  plan: string;
  gb: number;
  priceRand: number;
  /** What else is in the plan, or what to watch for. */
  note: string;
  /** Where the price comes from and its year. */
  source: string;
};

export const BUNDLE_COMPARISON_AS_OF = "Indicative prices, 2024 to 2026";

export const BUNDLE_COMPARISON_DISCLAIMER =
  "These are published list prices from news reports and provider pages, from different years, " +
  "and mobile data prices change often. Bundle sizes differ, so compare the price per GB. " +
  "Check the provider's own site or app for today's price before you buy.";

/** Monthly (about 30 day) data bundles, closest to 10GB where the provider sells one. */
export const BUNDLE_LISTINGS: readonly BundleListing[] = [
  {
    id: "vodacom",
    provider: "Vodacom",
    logoDomain: "vodacom.co.za",
    plan: "12GB",
    gb: 12,
    priceRand: 499,
    note: "Network coverage is the widest; out-of-bundle rates are high.",
    source: "BusinessTech, 2024",
  },
  {
    id: "mtn",
    provider: "MTN",
    logoDomain: "mtn.co.za",
    plan: "10GB",
    gb: 10,
    priceRand: 469,
    note: "Night and social bundles are sold separately.",
    source: "BusinessTech, 2024",
  },
  {
    id: "cellc",
    provider: "Cell C",
    logoDomain: "cellc.co.za",
    plan: "12GB",
    gb: 12,
    priceRand: 299,
    note: "Uses roaming on other networks outside its own coverage.",
    source: "BusinessTech, 2024",
  },
  {
    id: "telkom",
    provider: "Telkom",
    logoDomain: "telkom.co.za",
    plan: "10GB + 10GB night",
    gb: 10,
    priceRand: 149,
    note: "Night Surfer data is extra. Telkom raised some prepaid prices in April 2026.",
    source: "Telkom catalogue, undated",
  },
  {
    id: "afrihost",
    provider: "Afrihost AirMobile",
    logoDomain: "afrihost.com",
    plan: "10GB",
    gb: 10,
    priceRand: 150,
    note: "Runs on another network, so coverage depends on where you are.",
    source: "TechCentral",
  },
  {
    id: "capitec",
    provider: "Capitec Connect",
    logoDomain: "capitecbank.co.za",
    plan: "10GB, 30 days",
    gb: 10,
    priceRand: 150,
    note: "Bought in the Capitec app and tied to a Capitec account.",
    source: "TechCentral",
  },
  {
    id: "rain",
    provider: "Rain",
    logoDomain: "rain.co.za",
    plan: "2GB",
    gb: 2,
    priceRand: 165,
    note: "Data-only SIM. The older unlimited plans are no longer sold.",
    source: "tech.africa, 2026",
  },
];

export function bundlePricePerGb(listing: BundleListing): number {
  return listing.priceRand / listing.gb;
}

/** Cheapest per GB first. A plain ordering: nothing is marked as the one to pick. */
export function sortedBundleListings(): BundleListing[] {
  return [...BUNDLE_LISTINGS].sort((a, b) => bundlePricePerGb(a) - bundlePricePerGb(b));
}
