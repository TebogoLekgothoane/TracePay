import { useEffect } from "react";
import { Image, View } from "react-native";
import { useColorScheme } from "nativewind";
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import {
  AnimatedDroplet,
  BOUNCE,
  DROPLET_EASING,
  MARK,
} from "../TracePayAnimatedSplash";
import { LOGO, LOGO_ASPECT } from "../../theme/logo";

type Props = {
  width: number;
  height: number;
  /** Accepted so existing call sites keep working; the logo keeps its own colours. */
  color?: string;
  preserveAspectRatio?: string;
};

/** A beat after the screen shows, then the droplet falls. Shorter than on the splash. */
const DROP_DELAY = 200;
const DROP_DURATION = 900;

/**
 * The TracePay logo (the wave with the droplet), in the light or dark version for the theme.
 * Each time it appears, the droplet falls onto the wave and bounces, the same way as on the
 * splash screen.
 */
export function TracePayMark({ width, height }: Props) {
  const { colorScheme } = useColorScheme();
  const art = LOGO[colorScheme === "dark" ? "dark" : "light"];
  const reduceMotion = useReducedMotion();

  const droplet = useSharedValue(reduceMotion ? 1 : 0);
  const impact = useSharedValue(0);
  // The splash's camera dive is not used here, so this stays at 0.
  const dive = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const landAt = DROP_DELAY + DROP_DURATION;
    droplet.value = withDelay(
      DROP_DELAY,
      withTiming(1, { duration: DROP_DURATION, easing: DROPLET_EASING }),
    );
    impact.value = withDelay(
      landAt,
      withSequence(
        ...BOUNCE.map(([value, duration]) =>
          withTiming(value, { duration, easing: Easing.inOut(Easing.sin) }),
        ),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- play once when the logo appears
  }, []);

  // The logo fits inside the box it is given, keeping its shape.
  const logoWidth = Math.min(width, height * LOGO_ASPECT.mark);
  const logoHeight = logoWidth / LOGO_ASPECT.mark;

  return (
    <View
      accessibilityLabel="TracePay"
      style={{ width, height, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ width: logoWidth, height: logoHeight, overflow: "visible" }}>
        <Image
          source={art.wave}
          style={{ width: logoWidth, height: logoHeight }}
          resizeMode="contain"
        />
        <AnimatedDroplet
          source={art.droplet}
          displayScale={logoWidth / MARK.width}
          progress={droplet}
          impact={impact}
          dive={dive}
          fallDistance={logoHeight * 1.5}
          riseDistance={0}
        />
      </View>
    </View>
  );
}
