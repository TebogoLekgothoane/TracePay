import type { ForYouCard } from "./for-you.types";

export const FOR_YOU_FEED_LIMIT = 3;

export const FOR_YOU_CARDS: readonly ForYouCard[] = [
  {
    id: "music-overlap",
    title: "You're paying for 2 music apps",
    subtitle: "Spotify and YouTube Premium. Consider cancelling one?",
    actionLabel: "Compare & Decide",
    href: "/leak/subscription/spotify",
    brands: [
      { id: "spotify", name: "Spotify", logoDomain: "spotify.com" },
      { id: "youtube", name: "YouTube Premium", logoDomain: "youtube.com" },
    ],
  },
  {
    id: "streaming-overlap",
    title: "You're paying for 2 streaming apps",
    subtitle: "Netflix and Showmax. Consider cancelling one?",
    actionLabel: "Compare & Decide",
    href: "/leak/subscription/netflix",
    brands: [
      { id: "netflix", name: "Netflix", logoDomain: "netflix.com" },
      { id: "showmax", name: "Showmax", logoDomain: "showmax.com" },
    ],
  },
  {
    id: "unused-adobe",
    title: "Adobe Acrobat looks unused",
    subtitle:
      "It's still on a yearly plan at R519. Cancel before the next renewal.",
    actionLabel: "Review plan",
    href: "/leak/subscription/adobe",
    brands: [{ id: "adobe", name: "Adobe Acrobat", logoDomain: "adobe.com" }],
  },
  {
    id: "dstv-premium",
    title: "You're on DSTV Premium",
    subtitle: "R899/month. A smaller package could cut this debit.",
    actionLabel: "Review package",
    href: "/leak/debit",
    brands: [{ id: "dstv", name: "DSTV Premium", logoDomain: "dstv.com" }],
  },
];

const KNOWN_IDS = new Set(FOR_YOU_CARDS.map((card) => card.id));

export function isForYouCardId(value: string): boolean {
  return KNOWN_IDS.has(value);
}

export function visibleForYouCards(
  dismissedIds: readonly string[],
  limit = FOR_YOU_FEED_LIMIT,
): ForYouCard[] {
  const dismissed = new Set(dismissedIds);
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;

  return FOR_YOU_CARDS.filter((card) => !dismissed.has(card.id)).slice(
    0,
    safeLimit,
  );
}
