import {
  FOR_YOU_CARDS,
  FOR_YOU_FEED_LIMIT,
  isForYouCardId,
  visibleForYouCards,
} from "./for-you.cards";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("feed keeps the first three undismissed cards", () => {
  const visible = visibleForYouCards([]);
  assert(visible.length === FOR_YOU_FEED_LIMIT, "caps the feed");
  assert(visible[0]?.id === FOR_YOU_CARDS[0]?.id, "keeps catalog order");
});

test("ignored cards drop out and the next card fills the feed", () => {
  const first = FOR_YOU_CARDS[0];
  const fourth = FOR_YOU_CARDS[3];
  assert(first && fourth, "catalog has a next card");

  const visible = visibleForYouCards([first.id]);
  assert(
    visible.every((card) => card.id !== first.id),
    "hides the ignored card",
  );
  assert(visible.some((card) => card.id === fourth.id), "promotes the next card");
  assert(visible.length === FOR_YOU_FEED_LIMIT, "keeps the feed limit");
});

test("an empty feed is a valid all-ignored state", () => {
  const dismissed = FOR_YOU_CARDS.map((card) => card.id);
  assert(visibleForYouCards(dismissed).length === 0, "hides the section");
});

test("rejects unknown ids and unsafe limits", () => {
  assert(isForYouCardId("music-overlap"), "accepts a catalog id");
  assert(!isForYouCardId("not-a-card"), "rejects unknown ids");
  assert(visibleForYouCards([], -2).length === 0, "clamps negative limits");
});
