export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  /** Corner radius; ignored when `circle` is set. */
  radius?: number;
  circle?: boolean;
  /** Use on the purple balance card, where the neutral grey would disappear. */
  onDark?: boolean;
};
