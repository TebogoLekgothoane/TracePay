import { View } from "react-native";

import TracePayIcon from "../../../assets/icons/assembled TracePay icon.svg";

export function SetupBrandHeader() {
  return (
    <View className="items-center pt-2">
      <TracePayIcon width={72} height={62} />
    </View>
  );
}
