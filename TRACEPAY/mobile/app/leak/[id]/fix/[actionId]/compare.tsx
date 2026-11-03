import { Redirect, useLocalSearchParams } from "expo-router";

/** Comparisons now sit on the action page itself; this keeps any old link working. */
export default function FixCompareScreen() {
  const { id, actionId } = useLocalSearchParams<{ id: string; actionId: string }>();
  return <Redirect href={`/leak/${id ?? "fees"}/fix/${actionId ?? ""}` as never} />;
}
