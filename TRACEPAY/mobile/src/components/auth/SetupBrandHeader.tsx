import { View } from "react-native";

import { TracePayMark as TracePayIcon } from "../ui/TracePayMark";

export function SetupBrandHeader() {
  return (
    <View className="items-center pt-2">
      <TracePayIcon width={72} height={62} />
    </View>
  );
}
