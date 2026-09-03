/**
 * Splash uses the assembled icon as the lockup.
 * Only the droplet is placed on the same 1342×894 canvas.
 */

export const TRACEPAY_ICON_COMPOSITION = {
  width: 1342,
  height: 894,
} as const;

export type PieceTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

function fitSlot(
  viewWidth: number,
  viewHeight: number,
  slot: { x: number; y: number; width: number; height: number },
): PieceTransform {
  const scale = Math.min(slot.width / viewWidth, slot.height / viewHeight);
  return {
    x: slot.x + (slot.width - viewWidth * scale) / 2,
    y: slot.y + (slot.height - viewHeight * scale) / 2,
    scale,
    rotation: 0,
  };
}

export const TRACEPAY_DROPLET = {
  viewWidth: 1145,
  viewHeight: 1374,
  final: fitSlot(1145, 1374, {
    x: 548,
    y: 196,
    width: 286,
    height: 368,
  }),
  start: { x: 18, y: -156, rotation: 0 },
} as const;
