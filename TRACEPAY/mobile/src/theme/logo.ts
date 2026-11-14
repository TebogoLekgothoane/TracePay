/**
 * The TracePay logo as images, one set per theme. The logo is two pieces, the wave and the
 * droplet, so the droplet can fall onto the wave. The dark set has only the very darkest
 * shadows lifted so the logo stays readable on a dark background; the purple is unchanged.
 */
export const LOGO = {
  light: {
    wave: require("../../assets/logo/wave-light.png"),
    droplet: require("../../assets/logo/droplet-light.png"),
    wordmark: require("../../assets/splash/wordmark-light.png"),
  },
  dark: {
    wave: require("../../assets/logo/wave-dark.png"),
    droplet: require("../../assets/logo/droplet-dark.png"),
    wordmark: require("../../assets/splash/wordmark-dark.png"),
  },
} as const;

/** Width / height of each image, so a logo can be sized from its width alone. */
export const LOGO_ASPECT = {
  mark: 1214 / 804,
  wordmark: 1313 / 156,
} as const;
