export const TAU = Math.PI * 2;

export const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

export function getSlotLapDelta(slotIndex, rotation, slotCount, backAngle = Math.PI) {
  const baseAngle = slotIndex / slotCount * TAU;
  const initialLap = Math.floor((baseAngle - backAngle) / TAU);
  const currentLap = Math.floor((rotation + baseAngle - backAngle) / TAU);
  return currentLap - initialLap;
}

export function getSlotPhotoIndex({ slotIndex, rotation, slotCount, photoCount, backAngle = Math.PI }) {
  if (photoCount <= 0 || slotCount <= 0) return -1;
  const lapDelta = getSlotLapDelta(slotIndex, rotation, slotCount, backAngle);
  return positiveModulo(slotIndex + lapDelta * slotCount, photoCount);
}

export function getSequencePosition(rotation, slotCount, photoCount) {
  if (photoCount <= 0 || slotCount <= 0) return 0;
  const crossedSlots = Math.floor(Math.abs(rotation) / TAU * slotCount);
  return Math.min(photoCount, slotCount + crossedSlots);
}
