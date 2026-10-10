export type ForYouBrand = {
  id: string;
  name: string;
  logoDomain: string;
};

export type ForYouHref =
  | "/leak/debit"
  | "/leak/subscription/adobe"
  | "/leak/subscription/netflix"
  | "/leak/subscription/spotify"
  | "/leak/subscription/youtube";

export type ForYouCard = {
  id: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  href: ForYouHref;
  brands: ForYouBrand[];
};
