/**
 * The TracePay logo as images, one set per theme. The dark set has the near-black ink
 * lightened so the logo stays readable on a dark background; the purple is unchanged.
 */
export const LOGO = {
  light: {
    mark: require("../../assets/logo/mark-light.png"),
    wordmark: require("../../assets/splash/wordmark-light.png"),
  },
  dark: {
    mark: require("../../assets/logo/mark-dark.png"),
    wordmark: require("../../assets/splash/wordmark-dark.png"),
  },
} as const;

/** Width / height of each image, so a logo can be sized from its width alone. */
export const LOGO_ASPECT = {
  mark: 560 / 461,
  wordmark: 1313 / 156,
} as const;
