/**
 * Both wordmark SVGs fill the same 1897×632 canvas, so "PAY" (3 letters)
 * is drawn about 1.5× taller than "TRACE" (5 letters). These are each word's
 * real glyph bounds, used to crop the viewBox and size both at one letter height.
 */
const TRACE = { x: 95, y: 170, w: 1706, h: 270 };
const PAY = { x: 154, y: 118, w: 1585, h: 400 };
const GAP = 0.3; // between the words, in letter heights

export const TRACE_VIEWBOX = `${TRACE.x} ${TRACE.y} ${TRACE.w} ${TRACE.h}`;
export const PAY_VIEWBOX = `${PAY.x} ${PAY.y} ${PAY.w} ${PAY.h}`;

export function wordmarkLayout(totalWidth: number) {
  const height = totalWidth / (TRACE.w / TRACE.h + PAY.w / PAY.h + GAP);
  const traceWidth = height * (TRACE.w / TRACE.h);
  const payWidth = height * (PAY.w / PAY.h);
  return { height, traceWidth, payWidth, payLeft: traceWidth + height * GAP };
}
