export const PARTNERS = [
  { id: "shoprite", name: "Shoprite", offer: "5% off groceries", pts: 150, logoDomain: "shoprite.co.za" },
  { id: "pnp", name: "Pick n Pay", offer: "R20 voucher", pts: 200, logoDomain: "pnp.co.za" },
  { id: "checkers", name: "Checkers", offer: "3% cashback", pts: 180, logoDomain: "checkers.co.za" },
  { id: "mrprice", name: "Mr Price", offer: "10% off clothing", pts: 120, logoDomain: "mrpricegroup.com" },
  { id: "clicks", name: "Clicks", offer: "R15 off pharmacy", pts: 100, logoDomain: "clicks.co.za" },
  { id: "woolworths", name: "Woolworths", offer: "8% off food", pts: 160, logoDomain: "woolworths.co.za" },
] as const;

export type PartnerDeal = (typeof PARTNERS)[number];
