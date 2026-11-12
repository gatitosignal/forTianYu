import assert from "node:assert/strict";
import {
  TAU,
  getSequencePosition,
  getSlotPhotoIndex,
} from "../src/scenes/photoSlotSequence.js";

const slotCount = 8;
const photoCount = 73;
const indicesAt = (rotation) => Array.from({ length: slotCount }, (_, slotIndex) => (
  getSlotPhotoIndex({ slotIndex, rotation, slotCount, photoCount })
));

assert.deepEqual(indicesAt(0), [0, 1, 2, 3, 4, 5, 6, 7]);

for (const rotation of [0, 0.3, Math.PI / 2, Math.PI, TAU, TAU * 2.4, -0.3, -Math.PI, -TAU]) {
  assert.deepEqual(indicesAt(rotation), indicesAt(rotation), `rotation ${rotation} must be deterministic`);
}

const cardinalRotations = [0, Math.PI / 2, Math.PI, Math.PI * 1.5, TAU];
const cardinalSnapshots = cardinalRotations.map(indicesAt);
for (let index = cardinalRotations.length - 1; index >= 0; index -= 1) {
  assert.deepEqual(
    indicesAt(cardinalRotations[index]),
    cardinalSnapshots[index],
    `reverse scrolling must restore the ${cardinalRotations[index]} rotation state`,
  );
}

const afterOneTurn = indicesAt(TAU + 1e-6);
assert.deepEqual(afterOneTurn, [8, 9, 10, 11, 12, 13, 14, 15]);
assert.deepEqual(indicesAt(0), [0, 1, 2, 3, 4, 5, 6, 7], "reverse scrolling must restore the initial block");

const beforeBackCrossing = indicesAt(Math.PI / 4 - 1e-6);
const afterBackCrossing = indicesAt(Math.PI / 4 + 1e-6);
const changedSlots = afterBackCrossing.filter((value, index) => value !== beforeBackCrossing[index]);
assert.equal(changedSlots.length, 1, "only the slot crossing the hidden rear point may swap");

assert.equal(getSequencePosition(0, slotCount, photoCount), 8);
assert.equal(getSequencePosition(TAU, slotCount, photoCount), 16);
assert.equal(getSequencePosition(-TAU, slotCount, photoCount), 16);

// Validate the hanging geometry against the measured v008 GLB bounds.
const roofDiameter = 5.44;
const roofRadius = roofDiameter / 2;
const roofBottom = 5.3021;
const horseTop = 1.9336;
const columnRadius = 0.536;
const anchorRadius = roofRadius * 0.84;
const frameWidth = roofDiameter * 0.138;
const availableHeight = roofBottom + 0.018 - horseTop - 0.38;
const maxFrameHeight = Math.min(roofDiameter * 0.25, availableHeight * 0.42);
const longRope = availableHeight * 0.43;
const lowestFrameBottom = roofBottom + 0.018 - longRope - maxFrameHeight;
const slotArcSpacing = TAU * anchorRadius / slotCount;

assert.ok(anchorRadius + frameWidth / 2 < roofRadius, "frames must remain inside the canopy rim");
assert.ok(anchorRadius - frameWidth / 2 > columnRadius + 0.5, "frames must clear the center column");
assert.ok(lowestFrameBottom > horseTop + 0.38, "frames must clear the horses vertically");
assert.ok(slotArcSpacing > frameWidth * 1.8, "adjacent frames must have enough circumferential spacing");

console.log("photo slot sequence tests passed");
