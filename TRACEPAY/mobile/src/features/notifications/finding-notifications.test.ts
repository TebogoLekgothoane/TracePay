import {
  LEAKS_FALLBACK_HREF,
  belongsToUser,
  parseFindingNotification,
  readUpdate,
} from "./finding-notifications.model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const created = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  finding_id: "33333333-3333-4333-8333-333333333333",
  title: "Bank fee pattern detected",
  body: "A repeated pattern showed up in your latest statement. This is not money already saved.",
  created_at: "2026-10-10T18:00:00+00:00",
  delivery_status: "created",
  read_at: null,
};

const parsed = parseFindingNotification(created);
assert(parsed?.deliveryStatus === "created", "created notice");
assert(parsed?.readAt === null, "unread");
assert(parsed?.title === created.title, "title");
assert(!JSON.stringify(parsed).includes("411111"), "no account number in the parsed notice");

const read = parseFindingNotification({
  ...created,
  delivery_status: "read",
  read_at: "2026-10-10T20:00:00+00:00",
});
assert(read?.deliveryStatus === "read", "read notice");
assert(read?.readAt === "2026-10-10T20:00:00+00:00", "read time");

assert(belongsToUser(created.user_id, created.user_id), "owner");
assert(!belongsToUser("other-user", created.user_id), "other user");
assert(parseFindingNotification({ ...created, delivery_status: "sent" }) === null, "unknown status");
assert(
  parseFindingNotification({
    ...created,
    body: "CARD 4111111111111111 PURCHASE",
  }) === null,
  "long account numbers are not shown",
);

const update = readUpdate("2026-10-10T20:00:00+00:00");
assert(update.delivery_status === "read", "read update");
assert(!("user_id" in update), "read update does not retarget the owner");
assert(LEAKS_FALLBACK_HREF === "/(tabs)/leaks", "fallback route");

console.log("finding-notifications.test.ts passed");
