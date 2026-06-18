import { useColorScheme } from "@/hooks/useColorScheme";
import { radius } from "@/theme/colors";

/** @deprecated Prefer `useColorScheme().colors` */
export function useColors() {
  const { colors } = useColorScheme();
  return { ...colors, radius };
}
