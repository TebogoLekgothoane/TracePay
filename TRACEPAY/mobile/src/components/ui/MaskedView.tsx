import RawMaskedView from "@react-native-masked-view/masked-view";
import type { ComponentType, ReactElement, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type MaskedViewProps = {
  maskElement: ReactElement;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * @react-native-masked-view ships class-component types that React 19.3's JSX
 * typing rejects. The runtime component is unchanged; only its type is restated.
 */
export const MaskedView = RawMaskedView as unknown as ComponentType<MaskedViewProps>;
